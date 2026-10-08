import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// Execute the real mapping function with translations stubbed; no Nuxt/browser required.
const source = readFileSync(new URL('../app/composables/useToast.ts', import.meta.url), 'utf8')
const code = source.slice(source.indexOf('export function mapError'), source.indexOf('/** 统一错误 toast'))
  .replace('export function mapError(err: unknown, opts?: { fallback?: string }): string', 'function mapError(err, opts)')
const names = ['CREDITS_DEPLETED_RE', 'MODEL_UNAVAILABLE_RE', 'NETWORK_RE', 'NONJSON_RE', 'MODERATION_RE', 'AUTH_RE', 'RATELIMIT_RE', 'SERVER5XX_RE', 'TIMEOUT_RE', 'TECHY_RE']
const regexes = names.map(name => {
  const declaration = source.match(new RegExp(`(?:export )?const ${name} = (/.+/[a-z]*)`))
  assert.ok(declaration, name)
  return Function(`return ${declaration[1]}`)()
})
const mapError = Function(...names, 't', 'messageOf', code + '\nreturn mapError')(...regexes, key => key, err => err instanceof Error ? err.message : String(err))

test('HTTP 500 wrapper does not conceal a friendly Flow account sync error', () => {
  const message = 'บัญชีหรือโปรเจกต์ Google Flow เปลี่ยนระหว่างซิงค์รูปอ้างอิง กรุณาลองใหม่'
  assert.equal(mapError(new Error(`API error 500: ${JSON.stringify({ error: { message } })}`)), message)
})
test('provider rejection is classified from its payload, not its wrapper', () => {
  assert.equal(mapError('API error 500: {"error":{"message":"PUBLIC_ERROR_UNUSUAL_ACTIVITY"}}'), 'errors.flowAssessmentRejected')
  assert.equal(mapError('API error 429: {"error":{"message":"Too many requests"}}'), 'errors.rateLimit')
  assert.equal(mapError('API error 503: backend unavailable'), 'errors.unavailable')
})