import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-image-prompt-'))
process.env.FLOW_ENGINE_DIR = root
fs.mkdirSync(path.join(root, 'bin'))
const binary = path.join(root, 'bin', process.platform === 'darwin' ? 'flow-macos' : 'flow-linux')
fs.writeFileSync(binary, `#!/usr/bin/env node
require('fs').writeFileSync('args.json', JSON.stringify(process.argv.slice(2)));
const fs = require('fs');
if (fs.existsSync('busy')) fs.writeFileSync('overlap', '');
fs.writeFileSync('busy', '');
setTimeout(() => { fs.unlinkSync('busy'); process.exit(1); }, 30);
`, { mode: 0o755 })
const { generateFlowImage, cleanFlowErrorMessage } = await import('../src/services/flow-engine.js')
test('Flow image generation preserves the full prompt including constraints at the end', async t => {
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const prompt = 'Character reference sheet. ' + 'Detailed appearance and period clothing. '.repeat(65) + 'Pure white background; identical character across views; no text or watermarks.'
  await assert.rejects(generateFlowImage({ prompt, aspect: '1920x1080' }))
  const args = JSON.parse(fs.readFileSync(path.join(root, 'args.json'), 'utf8'))
  assert.equal(args[1], prompt)
  assert.ok(args.includes('16:9'))
  if (process.env.FLOW_RECAPTCHA) assert.equal(args[args.indexOf('--captcha') + 1], process.env.FLOW_RECAPTCHA)
  else assert.equal(args.includes('--captcha'), false)
  await Promise.allSettled([generateFlowImage({ prompt: 'one' }), generateFlowImage({ prompt: 'two' })])
  assert.equal(fs.existsSync(path.join(root, 'overlap')), false)
})

test('Flow errors distinguish rejected assessment and bad request without promising a cooldown duration', () => {
  assert.match(cleanFlowErrorMessage('PUBLIC_ERROR_UNUSUAL_ACTIVITY'), /reCAPTCHA/)
  assert.doesNotMatch(cleanFlowErrorMessage('PUBLIC_ERROR_UNUSUAL_ACTIVITY'), /30 วินาที/)
  assert.match(cleanFlowErrorMessage('PUBLIC_ERROR_UNUSUAL_ACTIVITY'), /ยังระบุไม่ได้/)
  assert.match(cleanFlowErrorMessage('batchexecute: ogiZ0b returned 400'), /HTTP 400/)
})