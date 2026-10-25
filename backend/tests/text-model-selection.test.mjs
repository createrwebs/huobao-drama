import { test } from 'node:test'
import assert from 'node:assert/strict'

test('managed fallback candidates are restricted to exact catalog IDs and bounded', async () => {
  const { getAllowedFallbackModels, isModelAccessError } = await import('../src/services/text-model-selection.ts')
  assert.deepEqual(getAllowedFallbackModels(['requested', 'live-b', 'live-c', 'live-d', 'live-e'], 'requested'), ['live-b', 'live-c', 'live-d'])
  assert.deepEqual(getAllowedFallbackModels([], 'requested'), [])
  assert.equal(isModelAccessError('This token has no access to model stale-model'), true)
  assert.equal(isModelAccessError('invalid JSON body'), false)
})

test('managed agent ignores stale prompt-file model and rejects unknown explicit overrides', async () => {
  const { resolveTextModelName } = await import('../src/services/text-model-selection.ts')
  const config = { model: 'live-default', availableModels: ['live-default', 'live-second'] }
  assert.equal(resolveTextModelName(config, 'stale-preset'), 'live-default')
  assert.equal(resolveTextModelName(config, 'live-second'), 'live-second')
  assert.equal(resolveTextModelName(config, 'stale-preset', 'live-second'), 'live-second')
  assert.throws(() => resolveTextModelName(config, undefined, 'not-in-key-catalog'), /not available/)
  assert.equal(resolveTextModelName({ model: 'direct-default' }, 'direct-file'), 'direct-file')
})

test('text config IDs cannot resolve image configs in managed runtime', async () => {
  const { configMatchesServiceType } = await import('../src/services/ai.ts')
  const imageConfig = { serviceType: 'image' }
  const textConfig = { serviceType: 'text' }
  assert.equal(configMatchesServiceType(imageConfig, 'text'), false)
  assert.equal(configMatchesServiceType(textConfig, 'text'), true)
})
