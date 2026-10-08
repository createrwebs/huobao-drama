import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { execFile } from 'child_process'
import Database from 'better-sqlite3'
import { resolveFlowEngine, listFlowAccounts } from './flow-engine.js'

export interface FlowReferenceContext {
  rootDir: string
  accountId: string
  projectId: string
  cookiePath: string
}

export interface UploadedFlowReference {
  media_id: string
  file_hash: string
  account_id: string
  project_id: string
}

export function getFlowReferenceContext(): FlowReferenceContext {
  const engine = resolveFlowEngine()
  if (!engine) throw new Error('Google Flow Engine is not configured')
  // Follow the browser, never substitute a different account based on credits.
  const account = listFlowAccounts().find(a => a.is_active)
  if (!account?.project_id) throw new Error('เปิด Google Flow project และซิงค์บัญชีผ่าน Flow Bridge ก่อน')
  return {
    rootDir: engine.rootDir, accountId: account.id, projectId: account.project_id,
    cookiePath: path.join(engine.rootDir, 'cookies', account.filename),
  }
}

export function assertFlowReferenceContext(context: FlowReferenceContext): void {
  const current = getFlowReferenceContext()
  if (current.accountId !== context.accountId || current.projectId !== context.projectId) {
    throw new Error('บัญชีหรือโปรเจกต์ Google Flow เปลี่ยนระหว่างซิงค์ กรุณาลองใหม่')
  }
}

export function referenceFileHash(file: string): string {
  if (!fs.statSync(file).isFile()) throw new Error(`Flow reference is not a file: ${file}`)
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function openCache(context: FlowReferenceContext): Database.Database {
  const dir = path.join(context.rootDir, 'data')
  fs.mkdirSync(dir, { recursive: true })
  const cache = new Database(path.join(dir, 'huobao-flow-references.sqlite3'))
  cache.pragma('busy_timeout = 5000')
  cache.exec(`CREATE TABLE IF NOT EXISTS image_references (
    account_id TEXT NOT NULL, project_id TEXT NOT NULL, file_hash TEXT NOT NULL,
    media_id TEXT NOT NULL, synced_at TEXT NOT NULL,
    PRIMARY KEY (account_id, project_id, file_hash)
  )`)
  return cache
}

export function getCachedFlowReference(context: FlowReferenceContext, hash: string): UploadedFlowReference | null {
  const cache = openCache(context)
  try {
    return cache.prepare('SELECT media_id, file_hash, account_id, project_id FROM image_references WHERE account_id = ? AND project_id = ? AND file_hash = ?')
      .get(context.accountId, context.projectId, hash) as UploadedFlowReference | undefined || null
  } finally { cache.close() }
}

const pendingUploads = new Map<string, Promise<UploadedFlowReference>>()

/** Upload once per content/account/project. Only genuine server responses enter this cache. */
export async function uploadFlowReference(file: string, context: FlowReferenceContext, force = false): Promise<UploadedFlowReference> {
  assertFlowReferenceContext(context)
  const hash = referenceFileHash(file)
  const key = JSON.stringify([context.rootDir, context.accountId, context.projectId, hash])
  const pending = pendingUploads.get(key)
  if (pending) return pending
  const cached = getCachedFlowReference(context, hash)
  if (cached && !force) return cached

  const work = (async () => {
    const helper = path.join(context.rootDir, 'bin', process.platform === 'win32' ? 'flow-reference-helper.exe' : 'flow-reference-helper')
    if (!fs.existsSync(helper)) {
      throw new Error('Flow image upload helper ยังไม่ได้ build: รัน sh scripts/build-flow-reference-helper.sh จากโฟลเดอร์ Huobao')
    }
    if (force) {
      const cache = openCache(context)
      try { cache.prepare('DELETE FROM image_references WHERE account_id = ? AND project_id = ? AND file_hash = ?').run(context.accountId, context.projectId, hash) }
      finally { cache.close() }
    }
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(helper, ['--file', file, '--cookies', context.cookiePath, '--db', path.join(context.rootDir, 'data', 'flow.db'), '--project', context.projectId, '--account', context.accountId],
        { cwd: context.rootDir, timeout: 150000, maxBuffer: 4 * 1024 * 1024 }, (err, out, stderr) => {
          if (err) {
            const detail = (stderr || err.message).trim().split('\n').filter(Boolean).at(-1) || 'Unknown upload error'
            if (/account.*changed|project.*changed/i.test(detail)) {
              return reject(new Error('บัญชีหรือโปรเจกต์ Google Flow เปลี่ยนระหว่างซิงค์รูปอ้างอิง กรุณาลองใหม่'))
            }
            return reject(new Error(`Flow reference upload failed: ${detail}`))
          }
          resolve(out)
        })
    })
    let result: any
    for (const line of stdout.trim().split('\n').reverse()) {
      try { result = JSON.parse(line); break } catch { /* engine progress is not JSON */ }
    }
    const returnedAccount = String(result?.account_id || '').replace(/^acct-/, '')
    if (typeof result?.media_id !== 'string' || !result.media_id.trim() || /^acct-/.test(result.media_id) || result.project_id !== context.projectId || returnedAccount !== context.accountId) {
      throw new Error('Flow upload returned an invalid media ID or a different account/project')
    }
    assertFlowReferenceContext(context)
    if (referenceFileHash(file) !== hash) throw new Error('รูปตัวละครเปลี่ยนระหว่างซิงค์ กรุณาลองใหม่')
    const cache = openCache(context)
    try {
      cache.prepare('INSERT OR REPLACE INTO image_references VALUES (?, ?, ?, ?, ?)')
        .run(context.accountId, context.projectId, hash, result.media_id, new Date().toISOString())
    } finally { cache.close() }
    return { media_id: result.media_id, file_hash: hash, account_id: context.accountId, project_id: context.projectId }
  })()
  pendingUploads.set(key, work)
  try { return await work } finally { pendingUploads.delete(key) }
}