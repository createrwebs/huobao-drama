import assert from 'node:assert/strict'
import { test } from 'node:test'
import { summarizeFlowOutput } from '../src/services/flow-diagnostics.js'

test('Flow diagnostics preserve phases without exposing credentials or prompts', () => {
  const result = summarizeFlowOutput([
    '2026/10/08 08:17:29 engine: ready — account acct-private, 16 cookies (/private/path), project secret-project, captcha chain(http,empty)',
    '2026/10/08 08:17:30 recaptcha: token acquired via http (2361 chars)',
    '2026/10/08 08:17:39 engine: uploaded private.jpg as media private-id (content secret-id)',
    'Cookie: SAPISID=SUPERSECRET; token=SECRET_TOKEN',
    'cli: run generate PRIVATE_PROMPT',
    '2026/10/08 08:17:47 cli: error: PUBLIC_ERROR_UNUSUAL_ACTIVITY',
  ].join('\n'))
  assert.equal(result.referenceUploads, 1)
  assert.deepEqual(result.events.map(e => e.event), ['session_ready', 'captcha_acquired', 'reference_uploaded', 'assessment_rejected'])
  assert.doesNotMatch(JSON.stringify(result), /SUPERSECRET|SECRET_TOKEN|PRIVATE_PROMPT|secret-project|acct-private|private\.jpg|secret-id/)
  assert.equal(result.videoSaved, false)
})