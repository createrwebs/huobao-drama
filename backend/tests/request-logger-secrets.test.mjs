import { test } from 'node:test'
import assert from 'node:assert/strict'

test('request logging redacts credentials before truncating nested bodies', async () => {
  const { redactRequestBody } = await import('../src/middleware/redact-request.ts')
  const body = JSON.stringify({ api_key: 'test-key-value', password: 'test-password', nested: { accessToken: 'test-access', cookies: [{ value: 'test-cookie' }] }, prompt: 'keep prompt' })
  const result = redactRequestBody(body)
  for (const secret of ['test-key-value', 'test-password', 'test-access', 'test-cookie']) assert.ok(!result.includes(secret))
  assert.ok(result.includes('keep prompt'))
  assert.equal(redactRequestBody('not json api_key=secret'), '[non-JSON body omitted]')
})
