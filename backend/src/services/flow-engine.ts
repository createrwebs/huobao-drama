import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execFile } from 'child_process'
import { v4 as uuid } from 'uuid'
import Database from 'better-sqlite3'
import { STORAGE_ROOT, DATA_ROOT } from '../utils/paths.js'
import { generateImageThumb } from '../utils/storage.js'
import { extractVideoPoster } from '../utils/video-poster.js'
import { enrichStoryboardVideoPrompt } from './video-prompts.js'
import { cookieDiagnostic, diagnosticHash, summarizeFlowOutput, writeFlowDiagnostic } from './flow-diagnostics.js'

// Known directories for Google Flow engine binary and cookies
const CANDIDATE_FLOW_ROOTS = [
  process.env.FLOW_ENGINE_DIR,
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../flow-drama-autopilot/flow-agent-ref/flow-agent'),
  '/Users/noppanan/flow-drama-autopilot/flow-agent-ref/flow-agent',
  path.resolve(process.cwd(), '../flow-drama-autopilot/flow-agent-ref/flow-agent'),
  path.resolve(process.cwd(), './flow-agent'),
].filter(Boolean) as string[]

export interface FlowAccountItem {
  id: string              // e.g. "95f686e1fd82"
  filename: string        // e.g. "account_95f686e1fd82.json"
  project_id: string      // e.g. "a97750ed-e89a-4740-ab30-15499dc22b12"
  credits: number | null  // e.g. 989
  is_active: boolean      // true if current active account
  status: string          // "active" | "unknown" | "expired"
  cookies_count: number
  updated_at: string      // ISO string
  error?: string | null
}

export interface FlowEngineInfo {
  available: boolean
  rootDir: string | null
  binaryPath: string | null
  cookiesDir: string | null
  activeAccounts: number
  totalCredits?: number
  accounts?: FlowAccountItem[]
  activeAccount?: FlowAccountItem | null
  lastError?: string
}

export function resolveFlowEngine(): { rootDir: string; binaryPath: string } | null {
  for (const root of CANDIDATE_FLOW_ROOTS) {
    if (!fs.existsSync(root)) continue
    const binName = process.platform === 'darwin' ? 'flow-macos' : process.platform === 'win32' ? 'flow-windows.exe' : 'flow-linux'
    const binPath = path.join(root, 'bin', binName)
    if (fs.existsSync(binPath)) {
      return { rootDir: root, binaryPath: binPath }
    }
    // Also check root/flow or root/bin/flow
    const altBin = path.join(root, 'bin', 'flow')
    if (fs.existsSync(altBin)) {
      return { rootDir: root, binaryPath: altBin }
    }
  }
  return null
}

export function extractJsonFromOutput(stdout: string): any {
  const lines = stdout.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim()
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) continue
    const candidate = lines.slice(i).join('\n')
    try {
      return JSON.parse(candidate)
    } catch {
      continue
    }
  }
  return null
}

export function getBestFlowAccount(rootDir: string): FlowAccountItem | null {
  const accounts = listFlowAccounts()
  if (!accounts.length) return null

  // 1. If active account has credits > 0 or credits is unknown, prefer it
  const active = accounts.find(a => a.is_active)
  if (active && (active.credits === null || active.credits > 0)) {
    return active
  }

  // 2. Otherwise pick account with highest credits > 0
  const withCredits = accounts.filter(a => a.credits !== null && a.credits > 0)
  withCredits.sort((a, b) => (b.credits || 0) - (a.credits || 0))
  if (withCredits.length > 0) {
    return withCredits[0]
  }

  // 3. Fallback to active or first
  return active || accounts[0]
}

function flowAccountArgs(rootDir: string): string[] {
  const args = ['--db', path.join(rootDir, 'data', 'flow.db')]
  return args
}

export function cleanFlowErrorMessage(raw: string): string {
  if (!raw) return 'Google Flow video generation failed'

  if (/PUBLIC_ERROR_UNUSUAL_ACTIVITY/i.test(raw) || /rate limit/i.test(raw) || /unusual activity/i.test(raw)) {
    return 'Google Flow ปฏิเสธการประเมินคำขอ (PUBLIC_ERROR_UNUSUAL_ACTIVITY) ยังระบุไม่ได้ว่าเกิดจาก session, fingerprint, reCAPTCHA หรือข้อจำกัดของบัญชี การใช้ browser profile เดียวไม่ได้รับประกันว่าจะแก้ได้ กรุณาหยุดส่งซ้ำและตรวจ Flow engine/session ไม่สามารถรับประกันเวลาปลด cooldown ได้'
  }

  if (
    /was rejected or dropped by Google Flow/i.test(raw) ||
    /video\(s\) still unresolved/i.test(raw) ||
    /video\(s\) will never resolve/i.test(raw) ||
    /asset is not in the project listing yet/i.test(raw)
  ) {
    return 'Google Flow รับคำขอแล้วแต่ระบบตรวจสอบความปลอดภัยปฏิเสธการเรนเดอร์วิดีโอ (อาจมีคำเกี่ยวกับอาวุธ ความรุนแรง หรืออาการสลบ/อัมพาตในพร้อมท์) กรุณาปรับลดคำเสี่ยงในพร้อมท์แล้วลองใหม่'
  }

  if (/batchexecute:.*returned 400/i.test(raw)) {
    return 'Google Flow ปฏิเสธคำขอ (HTTP 400) กรุณารีโหลดหน้า Flow project และซิงค์ session ใหม่ ใช้ Flow Bridge เพียง browser profile เดียว หากยังไม่ผ่านต้องตรวจความเข้ากันได้ของ Flow engine กับหน้าเว็บปัจจุบัน'
  }

  if (/insufficient credits/i.test(raw) || /the account has 0/i.test(raw)) {
    return 'เครดิตในบัญชี Google Flow ไม่เพียงพอ กรุณาสลับบัญชีที่มีเครดิตในหน้าตั้งค่า หรืออัปเดต Cookie'
  }

  if (/401 and no session refresher/i.test(raw) || /cookies are not signed in/i.test(raw) || /Google rejected the protocol sign-in/i.test(raw)) {
    return 'เซสชันบัญชี Google Flow หมดอายุ กรุณาเปิดหน้า flow.google.com ในเบราว์เซอร์เพื่อซิงค์ Cookie ใหม่'
  }

  // Strip trailing pretty-printed JSON block from stdout so braces/fields are never returned as errors
  const withoutJson = raw.replace(/\n\{\s*"job_id"[\s\S]*$/m, '')

  // Find line starting with error: or cli: error:
  const lines = withoutJson.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (line.startsWith('error:') || line.startsWith('cli: error:')) {
      const clean = line.replace(/^(cli:\s*)?error:\s*/, '').replace(/^engine:\s*/, '').trim()
      if (clean && !clean.startsWith(")]}'") && !clean.startsWith('[[')) {
        return clean
      }
    }
  }

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (
      line &&
      !/^[\{\}\[\],]+$/.test(line) &&
      !/^"[a-z_]+":/i.test(line) &&
      !line.startsWith(")]}'") &&
      !line.startsWith('[[') &&
      !line.startsWith('2026/') &&
      !line.includes('targets=[')
    ) {
      return line
    }
  }

  return 'Google Flow video generation failed. Please try again.'
}

export function listFlowAccounts(): FlowAccountItem[] {
  const resolved = resolveFlowEngine()
  if (!resolved) return []

  const cookiesDir = path.join(resolved.rootDir, 'cookies')
  if (!fs.existsSync(cookiesDir)) return []

  const files = fs.readdirSync(cookiesDir).filter(f => f.startsWith('account_') && f.endsWith('.json'))
  if (!files.length) return []

  // Read accounts from flow.db if available
  const dbAccountsMap = new Map<string, { credits: number | null; status: string; last_error?: string | null }>()
  const dbPath = path.join(resolved.rootDir, 'data', 'flow.db')
  if (fs.existsSync(dbPath)) {
    try {
      const flowDb = new Database(dbPath, { readonly: true, fileMustExist: true })
      const rows = flowDb.prepare(`
        SELECT account_id, credits, status, last_error
        FROM accounts
      `).all() as Array<{ account_id: string; credits: number | null; status: string; last_error: string | null }>
      flowDb.close()
      for (const row of rows) {
        dbAccountsMap.set(row.account_id, {
          credits: row.credits,
          status: row.status,
          last_error: row.last_error,
        })
      }
    } catch (e) {
      console.warn('[FlowEngine] Error reading flow.db accounts:', e)
    }
  }

  // Read file-to-account mapping from flow.log if available
  const fileToAcctIdMap = new Map<string, string>()
  const logPath = path.join(resolved.rootDir, 'flow.log')
  if (fs.existsSync(logPath)) {
    try {
      const logContent = fs.readFileSync(logPath, 'utf-8')
      const re = /registered account (acct-[a-f0-9]+) from (account_[a-f0-9]+\.json)/g
      let m: RegExpExecArray | null
      while ((m = re.exec(logContent)) !== null) {
        fileToAcctIdMap.set(m[2], m[1])
      }
    } catch {
      // ignore
    }
  }

  const items: Array<FlowAccountItem & { mtimeMs: number }> = []

  for (const filename of files) {
    const fullPath = path.join(cookiesDir, filename)
    try {
      const stat = fs.statSync(fullPath)
      const content = fs.readFileSync(fullPath, 'utf-8')
      const data = JSON.parse(content)
      const id = filename.replace(/^account_/, '').replace(/\.json$/, '')
      const projectId = data.project_id || ''
      const cookiesCount = Array.isArray(data.cookies) ? data.cookies.length : 0

      // Match credits from flow.db
      let credits: number | null = null
      let status = 'active'
      let error: string | null = null

      const matchedAcctId = fileToAcctIdMap.get(filename)
      if (matchedAcctId && dbAccountsMap.has(matchedAcctId)) {
        const info = dbAccountsMap.get(matchedAcctId)!
        credits = info.credits
        status = info.status || 'active'
        error = info.last_error || null
      } else {
        for (const [acctId, info] of dbAccountsMap.entries()) {
          if (acctId.includes(id) || id.includes(acctId.replace(/^acct-/, ''))) {
            credits = info.credits
            status = info.status || 'active'
            error = info.last_error || null
            break
          }
        }
      }

      items.push({
        id,
        filename,
        project_id: projectId,
        credits,
        is_active: false,
        status,
        cookies_count: cookiesCount,
        updated_at: stat.mtime.toISOString(),
        error,
        mtimeMs: stat.mtimeMs,
      })
    } catch (err) {
      console.warn(`[FlowEngine] Error reading ${filename}:`, err)
    }
  }

  // Sort by mtimeMs descending (freshest first)
  items.sort((a, b) => b.mtimeMs - a.mtimeMs)

  // Follow the latest account bundle persisted by the browser bridge. Legacy
  // huobao-flow-account.json selections must not override browser updates.
  if (items.length > 0) {
    items[0].is_active = true
  }

  return items.map(({ mtimeMs, ...rest }) => rest)
}

export function switchFlowAccount(filenameOrId: string): { success: boolean; active_account: FlowAccountItem | null; accounts: FlowAccountItem[] } {
  const resolved = resolveFlowEngine()
  if (!resolved) throw new Error('Flow Engine not found')

  const cookiesDir = path.join(resolved.rootDir, 'cookies')
  const target = filenameOrId.trim()

  const existingAccounts = listFlowAccounts()
  const matched = existingAccounts.find(a =>
    a.id === target ||
    a.filename === target ||
    a.filename === `${target}.json` ||
    a.filename === `account_${target}.json` ||
    a.project_id === target
  )

  if (!matched) throw new Error('ไม่พบบัญชีที่ต้องการสลับ')

  let filename = matched ? matched.filename : target
  if (!filename.endsWith('.json')) {
    filename = filename.startsWith('account_') ? `${filename}.json` : `account_${filename}.json`
  }

  const fullPath = path.join(cookiesDir, filename)
  if (!fs.existsSync(fullPath)) {
    throw new Error(`ไม่พบบัญชี ${filename}`)
  }

  // A manual selection lasts only until the next browser sync. Repair timestamps
  // left in the future by the old selection code so they cannot mask that sync.
  const files = fs.readdirSync(cookiesDir).filter(f => f.endsWith('.json'))
  const now = new Date()
  for (const f of files) {
    try {
      const filePath = path.join(cookiesDir, f)
      const s = fs.statSync(filePath)
      if (s.mtimeMs >= now.getTime()) {
        fs.utimesSync(filePath, s.atime, new Date(now.getTime() - 1000))
      }
    } catch {}
  }
  fs.utimesSync(fullPath, now, now)

  const accounts = listFlowAccounts()
  const activeAccount = accounts.find(a => a.filename === filename) || accounts[0] || null

  return {
    success: true,
    active_account: activeAccount,
    accounts,
  }
}

export async function importFlowAccount(rawData: any): Promise<{ success: boolean; account: FlowAccountItem; accounts: FlowAccountItem[] }> {
  const resolved = resolveFlowEngine()
  if (!resolved) throw new Error('Flow Engine not found')

  let parsed: any = rawData
  if (typeof rawData === 'string') {
    try {
      parsed = JSON.parse(rawData.trim())
    } catch {
      throw new Error('รูปแบบ JSON ไม่ถูกต้อง กรุณาตรวจสอบโค้ดที่คัดลอกมา')
    }
  }

  if (Array.isArray(parsed)) {
    parsed = { cookies: parsed }
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('ข้อมูล Cookie ไม่ถูกต้อง (ต้องเป็น JSON Object หรือ Array ของ Cookies)')
  }

  let projectId = String(parsed.project_id || '').trim()
  if (!projectId || projectId.length < 5) {
    projectId = crypto.randomUUID()
    parsed.project_id = projectId
  }

  const cookies = Array.isArray(parsed.cookies) ? parsed.cookies : []
  if (!cookies.length) {
    throw new Error('ไม่พบรายการ cookies ในข้อมูล JSON (ต้องมีอาร์เรย์ cookies)')
  }

  const cookiesDir = path.join(resolved.rootDir, 'cookies')
  fs.mkdirSync(cookiesDir, { recursive: true })

  // Find if an existing account file has the same project_id
  const existingFiles = fs.readdirSync(cookiesDir).filter(f => f.startsWith('account_') && f.endsWith('.json'))
  let targetFilename = ''

  for (const f of existingFiles) {
    try {
      const existing = JSON.parse(fs.readFileSync(path.join(cookiesDir, f), 'utf-8'))
      if (existing.project_id === projectId) {
        targetFilename = f
        break
      }
    } catch {
      // ignore
    }
  }

  // If not found, generate new 12-hex hash
  if (!targetFilename) {
    const randomHex = crypto.randomBytes(6).toString('hex')
    targetFilename = `account_${randomHex}.json`
  }

  const targetPath = path.join(cookiesDir, targetFilename)

  const cleanPayload = {
    project_id: projectId,
    at: parsed.at || '',
    fsid: parsed.fsid || '',
    fingerprint: parsed.fingerprint || {
      user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
      sec_ch_ua: '"Chromium";v="154", "Google Chrome";v="154", "Not A(Brand";v="99"',
      platform: '"macOS"',
      language: 'th',
      mobile: '?0',
    },
    cookies,
  }

  fs.writeFileSync(targetPath, JSON.stringify(cleanPayload, null, 2), 'utf-8')
  const now = new Date()
  fs.utimesSync(targetPath, now, now)

  // Make the imported account the explicit selection; the UI requests a live refresh.
  switchFlowAccount(targetFilename)

  const accounts = listFlowAccounts()
  const account = accounts.find(a => a.filename === targetFilename) || accounts[0]

  return {
    success: true,
    account,
    accounts,
  }
}

export function deleteFlowAccount(filenameOrId: string): { success: boolean; accounts: FlowAccountItem[] } {
  const resolved = resolveFlowEngine()
  if (!resolved) throw new Error('Flow Engine not found')

  const cookiesDir = path.join(resolved.rootDir, 'cookies')
  let filename = filenameOrId.trim()
  if (!filename.endsWith('.json')) {
    filename = filename.startsWith('account_') ? `${filename}.json` : `account_${filename}.json`
  }

  const fullPath = path.join(cookiesDir, filename)
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath)
  }

  const accounts = listFlowAccounts()
  return {
    success: true,
    accounts,
  }
}

export async function getFlowEngineStatus(refresh = false): Promise<FlowEngineInfo> {
  const resolved = resolveFlowEngine()
  if (!resolved) {
    return {
      available: false,
      rootDir: null,
      binaryPath: null,
      cookiesDir: null,
      activeAccounts: 0,
      totalCredits: 0,
      accounts: [],
      activeAccount: null,
      lastError: 'ไม่พบโฟลเดอร์หรือไบนารี flow-agent ในเครื่อง',
    }
  }

  const cookiesDir = path.join(resolved.rootDir, 'cookies')

  let lastError: string | undefined
  // Refresh the same database that supplies the account list.
  if (refresh) {
    try {
      await new Promise<void>((res, reject) => {
        execFile(resolved.binaryPath, ['balance', '--refresh', '--db', path.join(resolved.rootDir, 'data', 'flow.db')], { cwd: resolved.rootDir, timeout: 90000 }, (err) => {
          if (err) reject(new Error('ไม่สามารถอัปเดตข้อมูลบัญชี Google Flow ได้ กรุณาตรวจสอบ session แล้วลองใหม่'))
          else res()
        })
      })
    } catch (refErr) {
      lastError = refErr instanceof Error ? refErr.message : 'Flow balance refresh failed'
    }
  }

  const accounts = listFlowAccounts()
  const activeAccount = accounts.find(a => a.is_active) || accounts[0] || null

  const totalCredits = activeAccount?.credits ?? undefined

  return {
    available: true,
    rootDir: resolved.rootDir,
    binaryPath: resolved.binaryPath,
    cookiesDir,
    activeAccounts: accounts.length,
    totalCredits,
    accounts,
    activeAccount,
    ...(lastError ? { lastError } : {}),
  }
}

export interface GenerateFlowImageOptions {
  prompt: string
  aspect?: string
  model?: string // gem_pix_2 | narwhal | harbor_seal
}

export interface FlowImageResult {
  url: string
  localPath: string
  absolutePath: string
  jobId?: string
}

export function softenFlowVideoPrompt(prompt: string): string {
  if (!prompt) return ''
  return prompt
    // Strip accidentally injected empty-hut style preset or negative flags
    .replace(/Shot on iPhone 16 Pro Max[\s\S]*?--no\s+cgi,\s*3d render,\s*cartoon[,\s]*/gi, '')
    .replace(/\bempty scene,?\s*no people\b[,\s]*/gi, '')
    .replace(/--no\s+[^\n.;,]+(?:,\s*[^\n.;,]+)*/gi, '')
    .replace(/(?:ปราศจากผู้คนในฉาก|ไม่มีผู้คนในฉาก|ปราศจากผู้คน)/g, '')
    // Soften weapon / restraint / unconscious / paralysis / body-scattered terms that trigger Veo async safety filter
    .replace(/มีมีดสั้นเหน็บอยู่ที่เอว|เหน็บมีดสั้นที่เอว/g, 'คาดผ้าคาดเอวอย่างทะมัดทะแมง')
    .replace(/มีดสั้น/g, 'ของใช้ประจำตัว')
    .replace(/อาวุธหลุดมือ/g, 'ของในมือหลุดร่วง')
    .replace(/อาวุธ/g, 'อุปกรณ์')
    .replace(/มีผ้าชุบน้ำปิดปากและจมูก/g, 'มีผ้าคลุมครึ่งหน้า')
    .replace(/นอนสลบเกลื่อนพื้น|สลบเกลื่อน|สลบไสล/g, 'นอนหลับพักผ่อน')
    .replace(/ล้มฟุบหมดสติ|นอนหมดสติ|หมดสติ/g, 'นอนหลับพักผ่อน')
    .replace(/นอนหมดสภาพเป็นอัมพาตอยู่บนพื้นดิน|นอนอัมพาตอยู่บนพื้น|นอนอัมพาตบนพื้น|นอนอัมพาต|เป็นอัมพาต|อัมพาต/g, 'นั่งกึ่งนอนอ่อนแรงอยู่บนพื้น')
    .replace(/นอนหมดสภาพกับพื้น|นอนหมดสภาพ/g, 'นั่งอ่อนแรงอยู่บนพื้น')
    .replace(/ร่างกายขยับไม่ได้/g, 'ท่าทางอ่อนล้า')
    .replace(/ด้วยความหวาดกลัว|ด้วยความหวาดผวา|ด้วยความตื่นตระหนก|ตื่นตระหนกหวาดผวา|หวาดผวา|หวาดกลัว|ตื่นตระหนก/g, 'ตกใจ')
    .replace(/ถูกมัดติดเสาไม้|ถูกมัดติดเสา/g, 'นั่งพิงเสาไม้')
    .replace(/กระท่อมไม้ซุงขังนักโทษ|กระท่อมคุมขัง|กระท่อมขัง/g, 'กระท่อมไม้ไผ่')
    .replace(/ขังนักโทษ|ถูกขัง|คุมขัง/g, 'พักอยู่ด้านใน')
    .replace(/ค่ายโจร/g, 'ค่ายพักกลางป่า')
    .replace(/หัวหน้าโจร/g, 'หัวหน้าค่าย')
    .replace(/พวกโจร/g, 'กลุ่มชายฉกรรจ์')
    .replace(/กลุ่มร่างของ/g, 'กลุ่มของ')
    .replace(/ก้าวข้ามร่างของ|ก้าวข้ามร่าง/g, 'เดินเลี่ยงผ่าน')
    .replace(/เดินก้าวผ่านร่างของ|เดินผ่านร่างของ|เดินผ่านร่าง|ก้าวผ่านร่างของ/g, 'เดินผ่าน')
    .replace(/จุดที่ร่างของ/g, 'จุดที่')
    .replace(/ร่างของ\s*/g, '')
    .replace(/ร่างพวกโจร|ร่างกลุ่มชายฉกรรจ์/g, 'กลุ่มชายฉกรรจ์')
    .replace(/นอนแน่นิ่ง/g, 'นอนหลับพักผ่อน')
    .replace(/เกลื่อนลานดิน|เกลื่อนกลาดบนพื้นดิน|เกลื่อนพื้น|เกลื่อนกลาด/g, 'อยู่บนลานดิน')
    .replace(/นอนนอนหลับ/g, 'นอนหลับ')
    .replace(/รมควัน/g, 'จุดสมุนไพรหอม')
    .replace(/,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function sanitizeFlowPrompt(prompt: string, maxLen = 1500): string {
  if (!prompt) return ''
  const trimmed = softenFlowVideoPrompt(prompt)
  if (trimmed.length <= maxLen) return trimmed
  const slice = trimmed.slice(0, maxLen)
  const lastPunct = Math.max(slice.lastIndexOf(','), slice.lastIndexOf(';'), slice.lastIndexOf('.'))
  if (lastPunct > maxLen * 0.7) {
    return slice.slice(0, lastPunct).trim()
  }
  return slice.trim()
}

let flowImageQueue: Promise<unknown> = Promise.resolve()

/** One engine process at a time: concurrent image tasks otherwise race the browser bridge. */
export function generateFlowImage(options: GenerateFlowImageOptions): Promise<FlowImageResult> {
  const run = flowImageQueue.then(() => runFlowImage(options))
  flowImageQueue = run.catch(() => undefined)
  return run
}

async function runFlowImage(options: GenerateFlowImageOptions): Promise<FlowImageResult> {
  const engine = resolveFlowEngine()
  if (!engine) throw new Error('Google Flow Engine is not configured or binary not found')

  let aspect = options.aspect || '1:1'
  if (aspect.includes('x')) {
    const [w, h] = aspect.split('x').map(Number)
    if (w > h) aspect = '16:9'
    else if (h > w) aspect = '9:16'
    else aspect = '1:1'
  }

  const model = options.model || 'gem_pix_2'
  // Image prompts carry layout/background/identity constraints at the end.
  // Do not silently cut those off: the image CLI accepts the complete prompt.
  const prompt = options.prompt.trim()
  const args = ['image', prompt, aspect, '--model', model, ...flowAccountArgs(engine.rootDir)]
  // Preserve the engine's default (the historical successful image path).
  // Browser captcha is opt-in: forcing it changed behavior without a live success.
  if (process.env.FLOW_RECAPTCHA) args.push('--captcha', process.env.FLOW_RECAPTCHA)

  return withFlowCliLock(() => new Promise((resolve, reject) => {
    execFile(engine.binaryPath, args, { cwd: engine.rootDir, timeout: 300000 }, async (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(cleanFlowErrorMessage(`${stderr || ''}\n${stdout || ''}\n${err.message}`)))
      }

      const parsed = extractJsonFromOutput(stdout)
      if (!parsed || !parsed.files || !parsed.files.length) {
        return reject(new Error(`Google Flow did not produce image: ${stderr || stdout}`))
      }

      const generatedFilePath = parsed.files[0].path
      if (!fs.existsSync(generatedFilePath)) {
        return reject(new Error(`Generated image file not found at: ${generatedFilePath}`))
      }

      // Copy to storage
      const ext = path.extname(generatedFilePath) || '.jpg'
      const filename = `${uuid()}${ext}`
      const targetDir = path.join(STORAGE_ROOT, 'images')
      fs.mkdirSync(targetDir, { recursive: true })

      const targetPath = path.join(targetDir, filename)
      fs.copyFileSync(generatedFilePath, targetPath)

      const localPath = `static/images/${filename}`
      const url = `/${localPath}`

      // Generate thumbnail
      try {
        await generateImageThumb(localPath)
      } catch (thumbErr) {
        console.warn('Could not generate thumb for Flow image:', thumbErr)
      }

      resolve({
        url,
        localPath,
        absolutePath: targetPath,
        jobId: parsed.job_id,
      })
    })
  }))
}

let flowCliQueue: Promise<unknown> = Promise.resolve()

function withFlowCliLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = flowCliQueue.then(fn, fn)
  flowCliQueue = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

export function resolveToLocalFilePath(ref: string | null | undefined): string | null {
  if (!ref || typeof ref !== 'string') return null
  const trimmed = ref.trim()
  if (!trimmed) return null

  // 1. Data URL (base64)
  if (trimmed.startsWith('data:image/')) {
    const match = trimmed.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/)
    if (match) {
      try {
        const ext = match[1].toLowerCase().replace('jpeg', 'jpg')
        const buffer = Buffer.from(match[2], 'base64')
        const tmpDir = path.join(STORAGE_ROOT, 'tmp')
        fs.mkdirSync(tmpDir, { recursive: true })
        const filePath = path.join(tmpDir, `flow-ref-${crypto.randomUUID()}.${ext}`)
        fs.writeFileSync(filePath, buffer)
        return filePath
      } catch (e) {
        console.warn('[FlowEngine] Error saving base64 reference image:', e)
        return null
      }
    }
  }

  // 2. Absolute path on disk
  if (path.isAbsolute(trimmed) && fs.existsSync(trimmed)) {
    return trimmed
  }

  // 3. Local URL (e.g. http://localhost:5679/static/... or http://127.0.0.1:5679/static/...)
  let cleanPath = trimmed
  if (/^https?:\/\/[^\/]+\/(static\/.*)$/.test(trimmed)) {
    cleanPath = trimmed.replace(/^https?:\/\/[^\/]+\//, '')
  } else if (/^https?:\/\//.test(trimmed)) {
    return null
  }

  // 4. Relative static path (e.g. "static/images/...", "/static/images/...")
  if (cleanPath.startsWith('/')) cleanPath = cleanPath.slice(1)

  if (cleanPath.startsWith('static/')) {
    const sub = cleanPath.slice('static/'.length)
    const candidate = path.join(STORAGE_ROOT, sub)
    if (fs.existsSync(candidate)) return candidate
  }

  const directCandidate = path.join(STORAGE_ROOT, cleanPath)
  if (fs.existsSync(directCandidate)) return directCandidate

  const cwdCandidate = path.resolve(process.cwd(), cleanPath)
  if (fs.existsSync(cwdCandidate)) return cwdCandidate

  const dataCandidate = path.resolve(process.cwd(), 'data', cleanPath)
  if (fs.existsSync(dataCandidate)) return dataCandidate

  return null
}

export interface GenerateFlowVideoOptions {
  prompt: string
  aspect?: string
  duration?: string
  quality?: string
  startImage?: string | null
  referenceImages?: string[]
  storyboardId?: number | null
  referenceMode?: string | null
  model?: string | null
}

export interface FlowVideoResult {
  url: string
  localPath: string
  absolutePath: string
  jobId?: string
  creditsRemaining?: number
}

export async function generateFlowVideo(options: GenerateFlowVideoOptions): Promise<FlowVideoResult> {
  const engine = resolveFlowEngine()
  if (!engine) throw new Error('Google Flow Engine is not configured or binary not found')

  let aspect = options.aspect || '9:16'
  if (aspect.includes('x')) {
    const [w, h] = aspect.split('x').map(Number)
    if (w > h) aspect = '16:9'
    else aspect = '9:16'
  }

  let duration = options.duration || '4s'
  if (!duration.endsWith('s')) duration = `${duration}s`

  const quality = options.quality || '360p'

  // CLI has no video --model flag. Accept its historical aliases, but never
  // silently pretend an explicit version/model choice is honored upstream.
  if (options.model && !/^veo(?:-(?:4|6|8|10)s-(?:360|720)p)?$/.test(options.model)) {
    throw new Error(`Flow CLI ไม่รองรับการเลือกโมเดล "${options.model}" โดยตรง ใช้ alias veo ของ engine หรือ engine ที่รองรับโมเดลนี้ก่อน`)
  }

  let resolvedStartImage = resolveToLocalFilePath(options.startImage)

  // If startImage not explicitly provided, check storyboard's first_frame_image / composed_image
  if (!resolvedStartImage && options.storyboardId) {
    try {
      const dbPath = process.env.SQLITE_PATH || path.join(DATA_ROOT, 'huobao.sqlite3')
      if (fs.existsSync(dbPath)) {
        const appDb = new Database(dbPath, { readonly: true })
        const sbRow = appDb.prepare(`
          SELECT composed_image, first_frame_image
          FROM storyboards WHERE id = ?
        `).get(options.storyboardId) as { composed_image?: string; first_frame_image?: string } | undefined

        if (sbRow && (sbRow.first_frame_image || sbRow.composed_image)) {
          resolvedStartImage = resolveToLocalFilePath(sbRow.first_frame_image || sbRow.composed_image)
        }
        appDb.close()
      }
    } catch (err) {
      console.warn('[FlowEngine] Error querying fallback storyboard frame:', err)
    }
  }

  // Legacy Flow route: pass local reference files directly to the CLI. The
  // engine uploads them in the same authenticated session as the generation.
  const resolvedRefImages: string[] = []
  const useStartImage = !!resolvedStartImage && options.referenceMode !== 'reference'
  if (!useStartImage) {
    for (const ref of options.referenceImages || []) {
      const file = resolveToLocalFilePath(ref)
      if (!file || !fs.statSync(file).isFile()) throw new Error(`ไม่พบไฟล์ภาพอ้างอิง: ${ref}`)
      if (!resolvedRefImages.includes(file)) resolvedRefImages.push(file)
    }
    if (!resolvedRefImages.length && options.storyboardId) {
      const { getStoryboardCharacterRefs } = await import('./flow-character-ref.js')
      for (const char of await getStoryboardCharacterRefs(options.storyboardId)) {
        if (!char.is_ready || !char.absolute_path) throw new Error(`ตัวละคร "${char.name}" ยังไม่มีไฟล์ภาพอ้างอิง`)
        if (!resolvedRefImages.includes(char.absolute_path)) resolvedRefImages.push(char.absolute_path)
      }
    }
  }
  if (options.referenceMode === 'reference' && !resolvedRefImages.length) {
    throw new Error('Ingredients-to-Video ต้องมีภาพอ้างอิงก่อนสร้างวิดีโอ')
  }

  const rawPrompt = options.prompt || ''
  const hasVisualRefs = resolvedRefImages.length > 0 || !!resolvedStartImage
  const enrichedPrompt = await enrichStoryboardVideoPrompt(rawPrompt, options.storyboardId, {
    skipCharacterProfile: hasVisualRefs,
  })
  const prompt = sanitizeFlowPrompt(enrichedPrompt, 1500)
  console.log(`[FlowEngine] Prompt with visual context: ${prompt.slice(0, 160)}...`)
  const args = ['generate', prompt, aspect, duration, quality]

  if (resolvedRefImages.length > 0) {
    // Veo Ingredients-to-Video (Character References)
    for (const refPath of resolvedRefImages) {
      args.push('--reference', refPath)
    }
    console.log(`[FlowEngine] Generating video with character references (${resolvedRefImages.length}):`, resolvedRefImages)
  } else if (resolvedStartImage) {
    args.push('--start-image', resolvedStartImage)
    console.log(`[FlowEngine] Generating video with --start-image: ${resolvedStartImage}`)
  } else {
    console.log('[FlowEngine] Generating text-to-video (no start image or character reference)')
  }

  args.push(...flowAccountArgs(engine.rootDir))
  // Select once per request using the old account policy. Do not set a global
  // project override; the selected cookie bundle owns its project.
  const account = getBestFlowAccount(engine.rootDir)
  if (!account) throw new Error('ไม่พบ cookies ของ Google Flow กรุณาซิงค์บัญชีก่อนสร้างวิดีโอ')
  args.push('--cookies', path.join(engine.rootDir, 'cookies', account.filename))

  const diagnosticId = uuid()
  const diagnosticStarted = Date.now()
  const cookiePath = path.join(engine.rootDir, 'cookies', account.filename)
  const beforeCookie = cookieDiagnostic(cookiePath)
  writeFlowDiagnostic(engine.rootDir, {
    event: 'video_start', diagnosticId, storyboardId: options.storyboardId ?? null,
    mode: resolvedRefImages.length ? 'reference' : resolvedStartImage ? 'start_image' : 'text',
    duration, quality, aspect, referenceCount: resolvedRefImages.length,
    promptLength: prompt.length, promptHash: diagnosticHash(prompt), cookie: beforeCookie,
    references: resolvedRefImages.map(file => ({ bytes: fs.statSync(file).size, contentHash: diagnosticHash(fs.readFileSync(file).toString('base64')) })),
    binaryModifiedAt: fs.statSync(engine.binaryPath).mtime.toISOString(),
  })

  const runGeneration = (): Promise<{ stdout: string; stderr: string }> => {
    return new Promise((resolve, reject) => {
      execFile(engine.binaryPath, args, { cwd: engine.rootDir, timeout: 600000 }, (err, stdout, stderr) => {
        const afterCookie = cookieDiagnostic(cookiePath)
        writeFlowDiagnostic(engine.rootDir, {
          event: 'video_process_exit', diagnosticId, elapsedMs: Date.now() - diagnosticStarted,
          exitCode: err?.code ?? 0, signal: err?.signal ?? null,
          cookieMetadataChanged: JSON.stringify(beforeCookie) !== JSON.stringify(afterCookie),
          cookie: afterCookie, ...summarizeFlowOutput(stderr),
        })
        if (err) return reject({ err, stdout, stderr })
        resolve({ stdout, stderr })
      })
    })
  }

  let execResult: { stdout: string; stderr: string }
  try {
    execResult = await withFlowCliLock(runGeneration)
  } catch (failure: any) {
    // The engine owns retries. Starting a second CLI job can duplicate uploads
    // and generate a second billable video after an ambiguous first response.
    throw new Error(cleanFlowErrorMessage(`${failure.stderr || ''}\n${failure.stdout || ''}\n${failure.err?.message || ''}`))
  }

  const { stdout, stderr } = execResult

      // Try multiple strategies to locate the generated .mp4 file
      let generatedFilePath = ''

      // 1. Check stdout / stderr for "saved <filename.mp4>"
      const outputText = `${stderr || ''}\n${stdout || ''}`
      const savedMatch = outputText.match(/saved\s+([\w\.-]+\.mp4)/)
      if (savedMatch && savedMatch[1]) {
        const candidate = path.join(engine.rootDir, 'output', savedMatch[1])
        if (fs.existsSync(candidate)) {
          generatedFilePath = candidate
        }
      }

      // 2. Check JSON output
      if (!generatedFilePath) {
        const parsed = extractJsonFromOutput(stdout)
        if (parsed?.files?.[0]?.path) {
          const candidate = path.resolve(engine.rootDir, parsed.files[0].path)
          if (fs.existsSync(candidate)) generatedFilePath = candidate
        }
      }

      // Never adopt the newest media DB row or an unrelated output file:
      // only a path explicitly returned by this invocation proves success.

  if (!generatedFilePath || !fs.existsSync(generatedFilePath)) {
    writeFlowDiagnostic(engine.rootDir, { event: 'video_output_missing', diagnosticId })
    const cleanMsg = cleanFlowErrorMessage(`${stderr || ''}\n${stdout || ''}`)
    throw new Error(cleanMsg)
  }

  // Copy to storage
  const ext = path.extname(generatedFilePath) || '.mp4'
  const filename = `${uuid()}${ext}`
  const targetDir = path.join(STORAGE_ROOT, 'videos')
  fs.mkdirSync(targetDir, { recursive: true })

  const targetPath = path.join(targetDir, filename)
  fs.copyFileSync(generatedFilePath, targetPath)

  writeFlowDiagnostic(engine.rootDir, { event: 'video_file_received', diagnosticId, bytes: fs.statSync(targetPath).size })

  const localPath = `static/videos/${filename}`
  const url = `/${localPath}`

  try {
    await extractVideoPoster(localPath)
  } catch (posterErr) {
    console.warn('Could not extract video poster:', posterErr)
  }

  const parsed = extractJsonFromOutput(stdout)
  return {
    url,
    localPath,
    absolutePath: targetPath,
    jobId: parsed?.job_id,
    creditsRemaining: parsed?.credits_remaining,
  }
}

export interface RecentFlowVideo {
  id?: number
  filename: string
  prompt?: string
  size: number
  sizeFormatted: string
  created_at: string
  url: string
}

export function listRecentFlowVideos(): RecentFlowVideo[] {
  const engine = resolveFlowEngine()
  if (!engine) return []

  const results: RecentFlowVideo[] = []
  const seenFilenames = new Set<string>()

  // 1. Read from flow.db media table if available
  const dbPath = path.join(engine.rootDir, 'data', 'flow.db')
  if (fs.existsSync(dbPath)) {
    try {
      const flowDb = new Database(dbPath, { readonly: true })
      const rows = flowDb.prepare(`
        SELECT id, prompt, file_path, size, created_at
        FROM media
        WHERE kind = 'video'
        ORDER BY id DESC
        LIMIT 40
      `).all() as Array<{ id: number; prompt: string; file_path: string; size: number; created_at: string }>
      flowDb.close()

      for (const row of rows) {
        if (!row.file_path) continue
        const filename = path.basename(row.file_path)
        const fullPath = path.isAbsolute(row.file_path) ? row.file_path : path.join(engine.rootDir, 'output', filename)
        if (fs.existsSync(fullPath)) {
          const stat = fs.statSync(fullPath)
          seenFilenames.add(filename)
          const sizeBytes = row.size || stat.size
          const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(1)
          results.push({
            id: row.id,
            filename,
            prompt: row.prompt || '',
            size: sizeBytes,
            sizeFormatted: `${sizeMb} MB`,
            created_at: row.created_at || stat.mtime.toISOString(),
            url: `/api/v1/flow-bridge/videos/${encodeURIComponent(filename)}`,
          })
        }
      }
    } catch (e) {
      console.warn('[FlowEngine] Error reading media table:', e)
    }
  }

  // 2. Also scan output/ directory for any .mp4 files not in DB
  const outputDir = path.join(engine.rootDir, 'output')
  if (fs.existsSync(outputDir)) {
    try {
      const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.mp4'))
      for (const filename of files) {
        if (seenFilenames.has(filename)) continue
        const fullPath = path.join(outputDir, filename)
        try {
          const stat = fs.statSync(fullPath)
          const sizeMb = (stat.size / (1024 * 1024)).toFixed(1)
          results.push({
            filename,
            prompt: '',
            size: stat.size,
            sizeFormatted: `${sizeMb} MB`,
            created_at: stat.mtime.toISOString(),
            url: `/api/v1/flow-bridge/videos/${encodeURIComponent(filename)}`,
          })
        } catch {}
      }
    } catch {}
  }

  return results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

export async function copyFlowVideoToStorage(filenameOrPath: string): Promise<{ localPath: string; url: string }> {
  const engine = resolveFlowEngine()
  if (!engine) throw new Error('Google Flow Engine not found')

  let sourcePath = filenameOrPath.trim()
  if (!path.isAbsolute(sourcePath)) {
    sourcePath = path.join(engine.rootDir, 'output', path.basename(sourcePath))
  }
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`ไม่พบไฟล์วิดีโอที่: ${sourcePath}`)
  }

  const ext = path.extname(sourcePath) || '.mp4'
  const filename = `${uuid()}${ext}`
  const targetDir = path.join(STORAGE_ROOT, 'videos')
  fs.mkdirSync(targetDir, { recursive: true })

  const targetPath = path.join(targetDir, filename)
  fs.copyFileSync(sourcePath, targetPath)

  const localPath = `static/videos/${filename}`
  await extractVideoPoster(localPath)

  return {
    localPath,
    url: `/${localPath}`,
  }
}

