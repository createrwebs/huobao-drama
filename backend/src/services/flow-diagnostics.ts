import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export function diagnosticHash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16)
}

/** Allowlisted facts only: never persist raw stdout/stderr, prompts or tokens. */
export function summarizeFlowOutput(output: string) {
  const events: Array<Record<string, unknown>> = []
  for (const line of output.split('\n')) {
    const timestamp = line.match(/^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?)/)?.[1]
    const ready = line.match(/engine: ready — account ([\w-]+),.*project ([\w-]+), captcha ([\w(),.-]+)/)
    const captcha = line.match(/recaptcha: token acquired via ([\w.-]+) \((\d+) chars\)/)
    if (ready) events.push({ event: 'session_ready', timestamp, accountHash: diagnosticHash(ready[1]), projectHash: diagnosticHash(ready[2]), captchaChain: ready[3] })
    else if (captcha) events.push({ event: 'captcha_acquired', timestamp, provider: captcha[1], tokenLength: Number(captcha[2]) })
    else if (/engine: uploaded .* as media .*\(content /.test(line)) events.push({ event: 'reference_uploaded', timestamp })
    else if (/engine: saved .*\.mp4/.test(line)) events.push({ event: 'video_saved', timestamp })
    else if (/PUBLIC_ERROR_UNUSUAL_ACTIVITY/.test(line)) events.push({ event: 'assessment_rejected', timestamp })
    else if (/returned (400|401|403|429|500|503)\b/.test(line)) events.push({ event: 'http_error', timestamp, status: Number(line.match(/returned (\d{3})/)![1]) })
  }
  return { events: events.slice(-100), referenceUploads: events.filter(e => e.event === 'reference_uploaded').length, videoSaved: events.some(e => e.event === 'video_saved') }
}

export function cookieDiagnostic(file: string) {
  try {
    const bundle = JSON.parse(fs.readFileSync(file, 'utf8'))
    const stat = fs.statSync(file)
    return {
      fileHash: diagnosticHash(path.basename(file)), modifiedAt: stat.mtime.toISOString(),
      cookieCount: Array.isArray(bundle.cookies) ? bundle.cookies.length : 0,
      hasPageToken: !!bundle.at, hasSessionId: !!bundle.fsid,
      fingerprintHash: bundle.fingerprint ? diagnosticHash(JSON.stringify(bundle.fingerprint)) : null,
      projectHash: bundle.project_id ? diagnosticHash(bundle.project_id) : null,
    }
  } catch { return { readable: false } }
}

/** Bounded local diagnostics, outside public /static. Logging must not break jobs. */
export function writeFlowDiagnostic(root: string, record: Record<string, unknown>): void {
  try {
    const dir = path.join(root, 'data')
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, 'huobao-flow-diagnostics.jsonl')
    if (fs.existsSync(file) && fs.statSync(file).size > 2 * 1024 * 1024) {
      fs.rmSync(file + '.1', { force: true })
      fs.renameSync(file, file + '.1')
    }
    fs.appendFileSync(file, JSON.stringify({ timestamp: new Date().toISOString(), ...record }) + '\n', { mode: 0o600 })
  } catch { console.warn('[FlowDiagnostics] Could not write diagnostic record') }
}