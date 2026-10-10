import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

export interface IntegrityReport {
  ok: boolean
  quickCheck: string
  tables: string[]
  rowCounts: Record<string, number>
}

/**
 * Creates an atomic SQLite backup using better-sqlite3's online backup API.
 * This safely handles active WAL logs without corrupting transactions.
 */
export async function backupDatabase(
  sourceSqlite: Database.Database,
  destinationPath: string
): Promise<void> {
  const dir = path.dirname(destinationPath)
  fs.mkdirSync(dir, { recursive: true })

  // If destination already exists, remove it first
  if (fs.existsSync(destinationPath)) {
    fs.unlinkSync(destinationPath)
  }

  // better-sqlite3 native backup API
  await sourceSqlite.backup(destinationPath)
}

/**
 * Inspects a database file, running PRAGMA quick_check and counting rows in all user tables.
 */
export function verifyDatabaseIntegrity(dbFilePath: string): IntegrityReport {
  if (!fs.existsSync(dbFilePath)) {
    throw new Error(`Database file does not exist at ${dbFilePath}`)
  }

  const db = new Database(dbFilePath, { readonly: true })
  try {
    const quickCheckResult = db.pragma('quick_check') as Array<{ quick_check: string }>
    const quickCheck = quickCheckResult?.[0]?.quick_check || 'unknown'
    const ok = quickCheck === 'ok'

    const tableRows = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      )
      .all() as Array<{ name: string }>

    const tables = tableRows.map((r) => r.name)
    const rowCounts: Record<string, number> = {}

    for (const t of tables) {
      try {
        const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM "${t}"`).get() as { cnt: number }
        rowCounts[t] = countRow.cnt
      } catch {
        rowCounts[t] = -1
      }
    }

    return {
      ok,
      quickCheck,
      tables,
      rowCounts,
    }
  } finally {
    db.close()
  }
}

/**
 * Safely restores a backup file over a destination database file.
 */
export function restoreDatabase(backupFilePath: string, targetFilePath: string): void {
  if (!fs.existsSync(backupFilePath)) {
    throw new Error(`Backup file not found at ${backupFilePath}`)
  }

  // Verify backup integrity before restoring
  const report = verifyDatabaseIntegrity(backupFilePath)
  if (!report.ok) {
    throw new Error(`Backup file failed integrity check (${report.quickCheck}); aborting restore`)
  }

  // Ensure target directory exists
  fs.mkdirSync(path.dirname(targetFilePath), { recursive: true })

  // Clean target wal/shm if present
  const walPath = `${targetFilePath}-wal`
  const shmPath = `${targetFilePath}-shm`
  if (fs.existsSync(walPath)) fs.unlinkSync(walPath)
  if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath)

  fs.copyFileSync(backupFilePath, targetFilePath)
}
