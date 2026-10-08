import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const read = name => readFileSync(new URL(`../app/views/drama/${name}.vue`, import.meta.url), 'utf8')
test('Flow reference UI consumes the already-unwrapped API response', () => {
  for (const name of ['episode', 'detail']) {
    const source = read(name)
    const start = source.indexOf('// ===== Google Flow Character References')
    assert.ok(start >= 0)
    const block = source.slice(start, source.indexOf('\n}', source.indexOf('async function sync', start)) + 2)
    assert.doesNotMatch(block, /res\??\.data/)
    assert.match(block, /(?:flowCharRefs|dramaCharRefs)\.value = res/)
  }
})
test('page loads do not upload references and video sync is backend-owned', () => {
  const source = read('episode')
  assert.doesNotMatch(source, /await syncFlowCharacterRefs\(false\)/)
  assert.match(source, /Flow sends local reference files/)
  assert.match(source, /reference_mode: isGoogleFlowVideo\.value && referenceImages\.length \? 'reference'/)
})