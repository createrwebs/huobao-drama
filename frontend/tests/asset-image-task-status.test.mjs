import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(new URL('../app/views/drama/episode.vue', import.meta.url), 'utf8')
test('single asset image requests follow the returned task ID rather than an existing image URL', () => {
  assert.match(source, /const taskId = response\?\.image_generation_id/)
  assert.match(source, /await taskAPI\.get\(taskId\)/)
  assert.match(source, /task\?\.status === 'failed'/)
  assert.match(source, /task\?\.status === 'completed'/)
  for (const [method, pending] of [['genCharImg', 'pendingCharImageIds'], ['genSceneImg', 'pendingSceneImageIds'], ['genPropImg', 'pendingPropImageIds']]) {
    const start = source.indexOf(`async function ${method}(`)
    const block = source.slice(start, source.indexOf('\nfunction ', start))
    assert.match(block, new RegExp(`watchAssetImageTask\\(response, id, ${pending}\\)`))
    assert.doesNotMatch(block, /const done = !!/)
  }
})
test('API client reports backend msg and nested provider errors', () => {
  const client = readFileSync(new URL('../app/composables/useApi.ts', import.meta.url), 'utf8')
  assert.match(client, /json\.message \|\| json\.msg \|\| json\.error\?\.message/)
})