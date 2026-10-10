import Database from 'better-sqlite3'
import { dbPath } from '../src/db/index.js'

export interface UnownedDramaSummary {
  id: number
  title: string
  status: string
  episodesCount: number
  charactersCount: number
  scenesCount: number
  storyboardsCount: number
  createdAt: string
}

export interface UnownedInventory {
  dramas: UnownedDramaSummary[]
  unownedTasksCount: number
  unownedAssetsCount: number
  unownedConfigsCount: number
  users: Array<{ id: number; issuer: string; externalUserId: number; username: string; displayName: string }>
}

/**
 * Inspects unowned entities in the database.
 */
export function getUnownedInventory(sqlite: Database.Database): UnownedInventory {
  const unownedDramasRaw = sqlite
    .prepare('SELECT id, title, status, created_at FROM dramas WHERE owner_user_id IS NULL')
    .all() as Array<{ id: number; title: string; status: string; created_at: string }>

  const dramas: UnownedDramaSummary[] = unownedDramasRaw.map((d) => {
    const epCount = (sqlite.prepare('SELECT COUNT(*) as c FROM episodes WHERE drama_id = ?').get(d.id) as any)?.c || 0
    const charCount = (sqlite.prepare('SELECT COUNT(*) as c FROM characters WHERE drama_id = ?').get(d.id) as any)?.c || 0
    const sceneCount = (sqlite.prepare('SELECT COUNT(*) as c FROM scenes WHERE drama_id = ?').get(d.id) as any)?.c || 0
    const sbCount = (
      sqlite
        .prepare(
          'SELECT COUNT(*) as c FROM storyboards s JOIN episodes e ON s.episode_id = e.id WHERE e.drama_id = ?'
        )
        .get(d.id) as any
    )?.c || 0

    return {
      id: d.id,
      title: d.title,
      status: d.status,
      episodesCount: epCount,
      charactersCount: charCount,
      scenesCount: sceneCount,
      storyboardsCount: sbCount,
      createdAt: d.created_at,
    }
  })

  const unownedTasksCount = (
    sqlite.prepare('SELECT COUNT(*) as c FROM sys_task WHERE owner_user_id IS NULL').get() as any
  )?.c || 0

  const unownedAssetsCount = (
    sqlite.prepare('SELECT COUNT(*) as c FROM assets WHERE owner_user_id IS NULL').get() as any
  )?.c || 0

  const unownedConfigsCount = (
    sqlite.prepare('SELECT COUNT(*) as c FROM ai_service_configs WHERE owner_user_id IS NULL').get() as any
  )?.c || 0

  const users = sqlite
    .prepare('SELECT id, issuer, external_user_id, username, display_name FROM users ORDER BY id ASC')
    .all() as Array<{ id: number; issuer: string; external_user_id: number; username: string; display_name: string }>

  return {
    dramas,
    unownedTasksCount,
    unownedAssetsCount,
    unownedConfigsCount,
    users: users.map(u => ({
      id: u.id,
      issuer: u.issuer,
      externalUserId: u.external_user_id,
      username: u.username,
      displayName: u.display_name,
    })),
  }
}

/**
 * Assigns an unowned drama and its related artifacts to a specific user.
 */
export function assignDramaOwnership(
  sqlite: Database.Database,
  dramaId: number,
  targetUserId: number
): { dramaUpdated: boolean; tasksUpdated: number; assetsUpdated: number } {
  // Validate target user exists
  const user = sqlite.prepare('SELECT id FROM users WHERE id = ?').get(targetUserId)
  if (!user) {
    throw new Error(`Target user ID ${targetUserId} does not exist in users table`)
  }

  const tx = sqlite.transaction(() => {
    const dramaRes = sqlite
      .prepare('UPDATE dramas SET owner_user_id = ? WHERE id = ?')
      .run(targetUserId, dramaId)

    const tasksRes = sqlite
      .prepare('UPDATE sys_task SET owner_user_id = ? WHERE drama_id = ? AND owner_user_id IS NULL')
      .run(targetUserId, dramaId)

    const assetsRes = sqlite
      .prepare('UPDATE assets SET owner_user_id = ? WHERE drama_id = ? AND owner_user_id IS NULL')
      .run(targetUserId, dramaId)

    return {
      dramaUpdated: dramaRes.changes > 0,
      tasksUpdated: tasksRes.changes,
      assetsUpdated: assetsRes.changes,
    }
  })

  return tx()
}

/**
 * Assigns ALL unowned dramas, tasks, and assets to a specific user.
 */
export function assignAllUnowned(
  sqlite: Database.Database,
  targetUserId: number
): { dramasUpdated: number; tasksUpdated: number; assetsUpdated: number; configsUpdated: number } {
  const user = sqlite.prepare('SELECT id FROM users WHERE id = ?').get(targetUserId)
  if (!user) {
    throw new Error(`Target user ID ${targetUserId} does not exist in users table`)
  }

  const tx = sqlite.transaction(() => {
    const dramasRes = sqlite
      .prepare('UPDATE dramas SET owner_user_id = ? WHERE owner_user_id IS NULL')
      .run(targetUserId)

    const tasksRes = sqlite
      .prepare('UPDATE sys_task SET owner_user_id = ? WHERE owner_user_id IS NULL')
      .run(targetUserId)

    const assetsRes = sqlite
      .prepare('UPDATE assets SET owner_user_id = ? WHERE owner_user_id IS NULL')
      .run(targetUserId)

    const configsRes = sqlite
      .prepare('UPDATE ai_service_configs SET owner_user_id = ? WHERE owner_user_id IS NULL')
      .run(targetUserId)

    return {
      dramasUpdated: dramasRes.changes,
      tasksUpdated: tasksRes.changes,
      assetsUpdated: assetsRes.changes,
      configsUpdated: configsRes.changes,
    }
  })

  return tx()
}

// CLI entry point if run directly
if (process.argv[1]?.includes('manage-ownership')) {
  const sqlite = new Database(dbPath)
  const cmd = process.argv[2] || 'preview'

  if (cmd === 'preview') {
    const inv = getUnownedInventory(sqlite)
    console.log('=== Unassigned Project Inventory ===')
    console.log(`Unowned Dramas: ${inv.dramas.length}`)
    for (const d of inv.dramas) {
      console.log(`- Drama #${d.id}: "${d.title}" (${d.status}) | ${d.episodesCount} eps, ${d.scenesCount} scenes, ${d.storyboardsCount} shots`)
    }
    console.log(`Unowned Tasks: ${inv.unownedTasksCount}`)
    console.log(`Unowned Assets: ${inv.unownedAssetsCount}`)
    console.log(`Unowned AI Configs: ${inv.unownedConfigsCount}`)
    console.log('\nRegistered Users:')
    for (const u of inv.users) {
      console.log(`- User #${u.id}: ${u.displayName} (${u.issuer}:${u.externalUserId})`)
    }
  } else if (cmd === 'assign') {
    const dramaId = Number(process.argv[3])
    const userId = Number(process.argv[4])
    if (!dramaId || !userId) {
      console.error('Usage: tsx scripts/manage-ownership.ts assign <dramaId> <userId>')
      process.exit(1)
    }
    const res = assignDramaOwnership(sqlite, dramaId, userId)
    console.log(`Assigned drama #${dramaId} to user #${userId}:`, res)
  } else if (cmd === 'assign-all') {
    const userId = Number(process.argv[3])
    if (!userId) {
      console.error('Usage: tsx scripts/manage-ownership.ts assign-all <userId>')
      process.exit(1)
    }
    const res = assignAllUnowned(sqlite, userId)
    console.log(`Assigned all unowned items to user #${userId}:`, res)
  } else {
    console.log('Commands: preview, assign <dramaId> <userId>, assign-all <userId>')
  }
}
