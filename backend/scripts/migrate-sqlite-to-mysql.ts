/**
 * One-way, repeatable SQLite -> MySQL migration for the current Huobao data.
 *
 * Safety:
 * - requires --apply, otherwise only inspects the source
 * - refuses to import into a non-empty target
 * - never deletes or modifies the SQLite source
 * - verifies row counts and owner references after import
 *
 * Example (MAMP):
 *   MYSQL_HOST=127.0.0.1 MYSQL_PORT=8889 MYSQL_USER=root MYSQL_PASSWORD=root \
 *   MYSQL_DATABASE=huobao_drama npx tsx scripts/migrate-sqlite-to-mysql.ts --apply
 */
import Database from 'better-sqlite3'
import mysql from 'mysql2/promise'
import fs from 'node:fs'
import path from 'node:path'

type SqliteTable = { name: string; sql: string }
type SqliteIndex = { name: string; sql: string }
type MysqlConnectionOptions = mysql.ConnectionOptions & { database?: string }

const repoRoot = path.resolve(process.cwd(), '..')
const sqlitePath = process.env.SQLITE_PATH || path.join(repoRoot, 'data', 'huobao.sqlite3')
const targetDatabase = process.env.MYSQL_DATABASE || 'huobao_drama'
const apply = process.argv.includes('--apply')

if (!fs.existsSync(sqlitePath)) throw new Error(`SQLite source not found: ${sqlitePath}`)

function mysqlOptions(database?: string): MysqlConnectionOptions {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL)
    return {
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      ...(database ? { database } : {}),
      charset: 'utf8mb4',
      connectTimeout: 5000,
    }
  }
  return {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    ...(database ? { database } : {}),
    charset: 'utf8mb4',
    connectTimeout: 5000,
  }
}

function quoteIdentifier(value: string): string {
  return `\`${value.replaceAll('`', '``')}\``
}

/** Convert the small SQLite dialect used by sqlite-schema.ts into MySQL 8 DDL. */
function toMysqlCreate(sql: string, table: string): string {
  let out = sql.trim().replace(/;$/, '')
  out = out.replace(/^CREATE TABLE\s+/i, 'CREATE TABLE IF NOT EXISTS ')
  // Keep primary and referencing columns on the same signed BIGINT type.
  out = out.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY')
  out = out.replace(/INTEGER PRIMARY KEY/gi, 'BIGINT NOT NULL PRIMARY KEY')
  out = out.replace(/\bINTEGER\b/gi, 'BIGINT')
  out = out.replace(/\bTEXT\b/gi, 'LONGTEXT')
  // MySQL does not allow defaults or indexed LONGTEXT columns.
  out = out.replace(/LONGTEXT\s+NOT NULL\s+DEFAULT\s+'([^']*)'/gi, "VARCHAR(255) NOT NULL DEFAULT '$1'")
  out = out.replace(/LONGTEXT\s+DEFAULT\s+'([^']*)'/gi, "VARCHAR(255) DEFAULT '$1'")
  if (table === 'app_settings') out = out.replace(/\bkey LONGTEXT PRIMARY KEY/i, '`key` VARCHAR(191) PRIMARY KEY')
  if (table === 'style_presets') out = out.replace(/\bvalue LONGTEXT NOT NULL/i, 'value VARCHAR(191) NOT NULL')
  if (table === 'users') out = out.replace(/\bissuer LONGTEXT NOT NULL/i, 'issuer VARCHAR(191) NOT NULL')
  if (table === 'auth_sessions') out = out.replace(/\bsession_token_hash LONGTEXT NOT NULL UNIQUE/i, 'session_token_hash VARCHAR(255) NOT NULL UNIQUE')
  if (table === 'users' && !/\brole\b/i.test(out)) {
    out = out.replace(/\s+UNIQUE\(issuer, external_user_id\)/i, "\n    role VARCHAR(32) NOT NULL DEFAULT 'user',\n    UNIQUE(issuer, external_user_id)")
  }
  return `${out} ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
}

function toMysqlIndex(sql: string): string {
  const out = sql.trim().replace(/;$/, '')
  // MySQL requires a prefix length when indexing a TEXT/LONGTEXT column.
  if (/idx_sys_task_type/i.test(out)) return out.replace(/\(type\)/i, '(type(191))')
  return out
}

function sourceSnapshot(db: Database.Database): { tables: SqliteTable[]; indexes: SqliteIndex[] } {
  const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY name").all() as SqliteTable[]
  const indexes = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name").all() as SqliteIndex[]
  return { tables, indexes }
}

async function targetIsEmpty(conn: mysql.Connection, tables: SqliteTable[]): Promise<boolean> {
  for (const table of tables) {
    let rows: any
    try {
      ;[rows] = await conn.query(`SELECT COUNT(*) AS n FROM ${quoteIdentifier(table.name)}`)
    } catch (error: any) {
      if (error?.code === 'ER_NO_SUCH_TABLE') continue
      throw error
    }
    if (Number((rows as { n: number }[])[0]?.n || 0) > 0) return false
  }
  return true
}

async function insertTable(conn: mysql.Connection, db: Database.Database, table: SqliteTable): Promise<number> {
  const columns = db.prepare(`PRAGMA table_info(${quoteIdentifier(table.name)})`).all() as { name: string }[]
  const rows = db.prepare(`SELECT * FROM ${quoteIdentifier(table.name)}`).all() as Record<string, unknown>[]
  if (!rows.length) return 0
  const columnSql = columns.map(c => quoteIdentifier(c.name)).join(', ')
  const rowPlaceholders = `(${columns.map(() => '?').join(', ')})`
  const batchSize = 100
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const values = batch.flatMap(row => columns.map(c => row[c.name] ?? null))
    const placeholders = batch.map(() => rowPlaceholders).join(', ')
    await conn.query(`INSERT INTO ${quoteIdentifier(table.name)} (${columnSql}) VALUES ${placeholders}`, values)
  }
  return rows.length
}

async function countTable(conn: mysql.Connection, name: string): Promise<number> {
  const [rows] = await conn.query(`SELECT COUNT(*) AS n FROM ${quoteIdentifier(name)}`)
  return Number((rows as { n: number }[])[0]?.n || 0)
}

async function main() {
  const sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true })
  const snapshot = sourceSnapshot(sqlite)
  const sourceCounts = new Map<string, number>()
  for (const table of snapshot.tables) {
    sourceCounts.set(table.name, Number((sqlite.prepare(`SELECT COUNT(*) AS n FROM ${quoteIdentifier(table.name)}`).get() as { n: number }).n))
  }
  console.log(`Source: ${sqlitePath}`)
  console.log(`Tables: ${snapshot.tables.length}; rows: ${[...sourceCounts.values()].reduce((a, b) => a + b, 0)}`)
  if (!apply) {
    console.log('DRY RUN: pass --apply to create/import MySQL data')
    sqlite.close()
    return
  }

  const admin = await mysql.createConnection(mysqlOptions())
  await admin.query(`CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(targetDatabase)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  await admin.end()
  const conn = await mysql.createConnection(mysqlOptions(targetDatabase))
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0')
    // Users must exist before auth_sessions' foreign key is created.
    const ordered = [...snapshot.tables].sort((a, b) => (a.name === 'users' ? -1 : b.name === 'users' ? 1 : a.name === 'auth_sessions' ? 1 : b.name === 'auth_sessions' ? -1 : a.name.localeCompare(b.name)))
    for (const table of ordered) {
      await conn.query(toMysqlCreate(table.sql, table.name))
    }
    if (!(await targetIsEmpty(conn, snapshot.tables))) {
      throw new Error(`Target ${targetDatabase} is not empty; refusing to merge or overwrite data`)
    }
    await conn.beginTransaction()
    const imported = new Map<string, number>()
    for (const table of ordered) imported.set(table.name, await insertTable(conn, sqlite, table))
    await conn.commit()
    for (const index of snapshot.indexes) {
      try {
        await conn.query(toMysqlIndex(index.sql))
      } catch (error: any) {
        if (!/already exists|duplicate key name/i.test(String(error?.message))) throw error
      }
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1')

    const mismatches: string[] = []
    for (const table of snapshot.tables) {
      const actual = await countTable(conn, table.name)
      if (actual !== sourceCounts.get(table.name)) mismatches.push(`${table.name}: source=${sourceCounts.get(table.name)} target=${actual}`)
    }
    const [orphans] = await conn.query(`SELECT COUNT(*) AS n FROM dramas d LEFT JOIN users u ON u.id=d.owner_user_id WHERE d.owner_user_id IS NOT NULL AND u.id IS NULL`)
    const orphanCount = Number((orphans as { n: number }[])[0]?.n || 0)
    if (mismatches.length || orphanCount) throw new Error(`Verification failed: ${mismatches.join('; ')} orphan_dramas=${orphanCount}`)
    console.log(`PASS: imported ${[...sourceCounts.values()].reduce((a, b) => a + b, 0)} rows into MySQL database ${targetDatabase}`)
    console.log(`PASS: row counts match; orphan dramas=${orphanCount}; SQLite source retained at ${sqlitePath}`)
  } catch (error) {
    await conn.rollback().catch(() => {})
    throw error
  } finally {
    await conn.end()
    sqlite.close()
  }
}

main().catch(error => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
