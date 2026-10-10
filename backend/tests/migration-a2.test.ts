import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import Database from 'better-sqlite3'
import { initSqliteSchema } from '../src/db/sqlite-schema.js'
import {
  backupDatabase,
  verifyDatabaseIntegrity,
  restoreDatabase,
} from '../src/utils/db-backup.js'
import {
  getUnownedInventory,
  assignDramaOwnership,
  assignAllUnowned,
} from '../scripts/manage-ownership.js'

test('A2: Migration rehearsal, SQLite-consistent backup/restore, and unowned allocation invariants', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'huobao-migration-test-'))
  const legacyDbPath = path.join(tempDir, 'legacy.sqlite3')
  const backupDbPath = path.join(tempDir, 'backup.sqlite3')
  const restoredDbPath = path.join(tempDir, 'restored.sqlite3')

  t.after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  // 1. Setup a realistic legacy database (pre-multi-user: no owner_user_id, no users, no auth_sessions)
  const legacySqlite = new Database(legacyDbPath)
  legacySqlite.exec(`
    CREATE TABLE dramas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      genre TEXT,
      style TEXT DEFAULT '3d',
      aspect_ratio TEXT DEFAULT '16:9',
      total_episodes INTEGER DEFAULT 1,
      total_duration INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft',
      thumbnail TEXT,
      tags TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE episodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drama_id INTEGER NOT NULL,
      episode_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      script_content TEXT,
      description TEXT,
      duration INTEGER DEFAULT 0,
      status TEXT DEFAULT 'draft',
      video_url TEXT,
      thumbnail TEXT,
      image_config_id INTEGER,
      video_config_id INTEGER,
      resolution TEXT DEFAULT '720p',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE scenes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drama_id INTEGER NOT NULL,
      episode_id INTEGER,
      location TEXT NOT NULL,
      time TEXT NOT NULL,
      prompt TEXT NOT NULL,
      lighting TEXT,
      final_prompt TEXT,
      storyboard_count INTEGER DEFAULT 1,
      image_url TEXT,
      status TEXT DEFAULT 'pending',
      local_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drama_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      role TEXT,
      description TEXT,
      appearance TEXT,
      styling TEXT,
      final_prompt TEXT,
      personality TEXT,
      image_url TEXT,
      reference_images TEXT,
      seed_value TEXT,
      sort_order INTEGER,
      local_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE storyboards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      episode_id INTEGER NOT NULL,
      scene_id INTEGER,
      storyboard_number INTEGER NOT NULL,
      title TEXT,
      location TEXT,
      time TEXT,
      shot_type TEXT,
      angle TEXT,
      movement TEXT,
      result TEXT,
      atmosphere TEXT,
      image_prompt TEXT,
      video_prompt TEXT,
      bgm_prompt TEXT,
      soundEffect TEXT,
      description TEXT,
      duration INTEGER DEFAULT 0,
      composed_image TEXT,
      first_frame_image TEXT,
      last_frame_image TEXT,
      reference_images TEXT,
      video_url TEXT,
      subtitle_url TEXT,
      composed_video_url TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE sys_task (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      storyboard_id INTEGER,
      drama_id INTEGER,
      status TEXT DEFAULT 'completed',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drama_id INTEGER,
      name TEXT,
      url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE style_presets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      value TEXT NOT NULL,
      prompt TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)

  // Insert two legacy dramas and related records
  const now = new Date().toISOString()
  legacySqlite.exec(`
    INSERT INTO dramas (id, title, status, created_at, updated_at) VALUES (1, 'Legacy Drama Alpha', 'completed', '${now}', '${now}');
    INSERT INTO dramas (id, title, status, created_at, updated_at) VALUES (2, 'Legacy Drama Beta', 'draft', '${now}', '${now}');

    INSERT INTO episodes (id, drama_id, episode_number, title, created_at, updated_at) VALUES (10, 1, 1, 'Ep 1 Alpha', '${now}', '${now}');
    INSERT INTO episodes (id, drama_id, episode_number, title, created_at, updated_at) VALUES (20, 2, 1, 'Ep 1 Beta', '${now}', '${now}');

    INSERT INTO scenes (id, drama_id, episode_id, location, time, prompt, created_at, updated_at) VALUES (100, 1, 10, 'Palace', 'Day', 'Grand hall', '${now}', '${now}');
    INSERT INTO characters (id, drama_id, name, created_at, updated_at) VALUES (1000, 1, 'Emperor', '${now}', '${now}');
    INSERT INTO storyboards (id, episode_id, storyboard_number, created_at, updated_at) VALUES (5000, 10, 1, '${now}', '${now}');

    INSERT INTO sys_task (id, type, drama_id, status, created_at, updated_at) VALUES (1, 'video', 1, 'completed', '${now}', '${now}');
    INSERT INTO assets (id, drama_id, name, url, created_at, updated_at) VALUES (1, 1, 'Banner', '/static/banner.jpg', '${now}', '${now}');
  `)

  // 2. Perform SQLite-consistent backup before any changes
  await backupDatabase(legacySqlite, backupDbPath)
  legacySqlite.close()

  const backupReport = verifyDatabaseIntegrity(backupDbPath)
  assert.equal(backupReport.ok, true)
  assert.equal(backupReport.rowCounts['dramas'], 2)
  assert.equal(backupReport.rowCounts['episodes'], 2)
  assert.equal(backupReport.rowCounts['storyboards'], 1)

  // 3. Rehearsal: Open legacy database and run initSqliteSchema
  const migratingSqlite = new Database(legacyDbPath)
  initSqliteSchema(migratingSqlite)

  const postReport = verifyDatabaseIntegrity(legacyDbPath)
  assert.equal(postReport.ok, true)
  // Row counts and IDs must be completely intact
  assert.equal(postReport.rowCounts['dramas'], 2)
  assert.equal(postReport.rowCounts['episodes'], 2)
  assert.equal(postReport.rowCounts['storyboards'], 1)
  assert.equal(postReport.rowCounts['sys_task'], 1)
  assert.equal(postReport.rowCounts['assets'], 1)

  // Verify owner_user_id column was added and is NULL for legacy records
  const dramaCols = migratingSqlite.prepare('PRAGMA table_info(dramas)').all() as any[]
  assert.ok(dramaCols.some((c) => c.name === 'owner_user_id'))

  const unownedDramas = migratingSqlite.prepare('SELECT id, title, owner_user_id FROM dramas').all() as any[]
  assert.equal(unownedDramas.length, 2)
  assert.equal(unownedDramas[0].owner_user_id, null)
  assert.equal(unownedDramas[1].owner_user_id, null)

  // 4. Invariant A2: Legacy dramas with owner_user_id = null are NOT public and NOT auto-assigned
  // Simulate first user logging in:
  migratingSqlite.exec(`
    INSERT INTO users (id, issuer, external_user_id, username, display_name, status, created_at, updated_at)
    VALUES (1, 'tora', 9001, 'first_user', 'First User', 'active', '${now}', '${now}');
  `)

  // A query for first_user's dramas must return 0 items
  const firstUserDramas = migratingSqlite
    .prepare('SELECT * FROM dramas WHERE owner_user_id = 1')
    .all()
  assert.equal(firstUserDramas.length, 0, 'First logged in user must NOT inherit unowned legacy projects')

  // 5. Inventory & Preview tool verification
  const inventory = getUnownedInventory(migratingSqlite)
  assert.equal(inventory.dramas.length, 2)
  const dramaAlpha = inventory.dramas.find((d) => d.id === 1)
  assert.ok(dramaAlpha)
  assert.equal(dramaAlpha?.episodesCount, 1)
  assert.equal(dramaAlpha?.scenesCount, 1)
  assert.equal(dramaAlpha?.charactersCount, 1)
  assert.equal(dramaAlpha?.storyboardsCount, 1)
  assert.equal(inventory.unownedTasksCount, 1)
  assert.equal(inventory.unownedAssetsCount, 1)
  assert.equal(inventory.users.length, 1)

  // 6. Deliberate Operator Assignment of Drama 1 to user 1
  const assignResult = assignDramaOwnership(migratingSqlite, 1, 1)
  assert.equal(assignResult.dramaUpdated, true)
  assert.equal(assignResult.tasksUpdated, 1)
  assert.equal(assignResult.assetsUpdated, 1)

  // User 1 now sees Drama 1, but Drama 2 is still unowned
  const user1DramasAfter = migratingSqlite.prepare('SELECT id FROM dramas WHERE owner_user_id = 1').all() as any[]
  assert.equal(user1DramasAfter.length, 1)
  assert.equal(user1DramasAfter[0].id, 1)

  const remainingInventory = getUnownedInventory(migratingSqlite)
  assert.equal(remainingInventory.dramas.length, 1)
  assert.equal(remainingInventory.dramas[0].id, 2)

  migratingSqlite.close()

  // 7. Verify atomic restore from backup
  restoreDatabase(backupDbPath, restoredDbPath)
  const restoredReport = verifyDatabaseIntegrity(restoredDbPath)
  assert.equal(restoredReport.ok, true)
  assert.equal(restoredReport.rowCounts['dramas'], 2)
  assert.equal(restoredReport.rowCounts['episodes'], 2)

  const restoredSqlite = new Database(restoredDbPath)
  const restoredCols = restoredSqlite.prepare('PRAGMA table_info(dramas)').all() as any[]
  // Original pre-migration DB had no owner_user_id, verifying restore restored exact state
  assert.equal(restoredCols.some((c) => c.name === 'owner_user_id'), false)
  restoredSqlite.close()
})
