import { test } from 'node:test'
import assert from 'node:assert/strict'

// Synthetic metadata only: no production credentials or session data.
const configs = [
  { id: 15, service_type: 'image', provider: 'google_flow', base_url: 'http://127.0.0.1:5679/api/v1/flow-bridge', model: ['gem_pix_2'] },
  { id: 17, service_type: 'text', provider: 'antigravity', base_url: 'http://127.0.0.1:8317', model: ['gemini-pro-agent'] },
  { id: 19, service_type: 'text', provider: 'gemini', name: 'Huobao Text · Gemini', base_url: 'https://api.firemux.com', api_key: 'masked-not-usable', model: ['gemini-3.8-flash'], priority: 101, is_active: true },
  { id: 24, service_type: 'video', provider: 'volcengine', name: 'Huobao Video · Seedance', base_url: 'https://api.firemux.com/volcengine', model: ['doubao-seedance-2-0-mini-260615'], priority: 96, is_active: true },
]

test('remote configs remove local engines and use the login key and configured Tora gateway paths', async () => {
  const { normalizeToraConfigs, publicToraConfig } = await import('../src/services/tora-configs.ts')
  const result = normalizeToraConfigs(configs, 'test-only-key', {
    gemini: 'https://www.toraapi.com', volcengine: 'https://www.toraapi.com/doubao',
  })
  assert.deepEqual(result.map(r => r.id), [19, 24])
  assert.equal(result[0].apiKey, 'test-only-key')
  assert.equal(result[1].baseUrl, 'https://www.toraapi.com/doubao')
  assert.deepEqual(JSON.parse(result[1].model), configs[3].model)
  const visible = result.map(publicToraConfig)
  assert.equal(visible[0].api_key_configured, true)
  assert.equal(visible[0].api_key, '********')
  assert.ok(!JSON.stringify(visible).includes('test-only-key'))
  assert.ok(!/Huobao|Firemux|127\.0\.0\.1/i.test(JSON.stringify(visible)))
})
