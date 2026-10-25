import { test } from 'node:test'
import assert from 'node:assert/strict'

const models = { object: 'list', data: [{ id: 'gemini-live-text' }, { id: 'gpt-image-live' }, { id: 'veo-live-video' }, { id: 'unknown-live-model' }] }
const pricing = { data: [
  { model_name: 'gemini-live-text', supported_endpoint_types: ['openai'], tags: 'Chat Completions' },
  { model_name: 'gpt-image-live', supported_endpoint_types: ['image-generation', 'openai'] },
  { model_name: 'veo-live-video', supported_endpoint_types: ['video-generation'] },
  { model_name: 'stale-not-authorized', supported_endpoint_types: ['openai'] },
] }

test('key-scoped /v1/models is the authority; metadata only categorizes returned exact IDs', async () => {
  const { parseToraModelCatalog, buildToraModelConfigs } = await import('../src/services/tora-model-catalog.ts')
  const catalog = parseToraModelCatalog(models, pricing)
  assert.deepEqual(catalog.map(m => [m.id, m.serviceType]), [
    ['gemini-live-text', 'text'], ['gpt-image-live', 'image'], ['veo-live-video', 'video'], ['unknown-live-model', 'unknown'],
  ])
  const configs = buildToraModelConfigs(catalog, 'fixture-only-key', 'https://gateway.example', [])
  assert.deepEqual(configs.map(c => [c.serviceType, c.provider, JSON.parse(c.model)]), [
    ['text', 'openai', ['gemini-live-text']], ['image', 'openai', ['gpt-image-live']],
  ])
  assert.ok(!configs.some(c => c.serviceType === 'video'))
  assert.equal(configs[0].apiKey, 'fixture-only-key')
})

test('name-only image inference is display-only and cannot create an executable config', async () => {
  const { parseToraModelCatalog, buildToraModelConfigs } = await import('../src/services/tora-model-catalog.ts')
  const catalog = parseToraModelCatalog({ data: [{ id: 'gemini-image-looking-id', supported_endpoint_types: ['gemini'] }] }, { data: [] })
  assert.equal(catalog[0].serviceType, 'image')
  assert.equal(catalog[0].inferred, true)
  assert.equal(catalog[0].executable, false)
  assert.deepEqual(buildToraModelConfigs(catalog, 'fixture-only-key', 'https://gateway.example', []), [])
})

test('malformed model response cannot silently use legacy preset IDs', async () => {
  const { parseToraModelCatalog } = await import('../src/services/tora-model-catalog.ts')
  assert.throws(() => parseToraModelCatalog({ message: 'not a catalog' }, pricing), /Invalid/)
  assert.deepEqual(parseToraModelCatalog({ data: [] }, pricing), [])
})
