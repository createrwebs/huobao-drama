import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const source = readFileSync(new URL('../src/routes/aiConfigs.ts', import.meta.url), 'utf8')
test('provider metadata route remains exported', () => {
  assert.match(source, /export const aiProviders = new Hono\(\)/)
})
test('profile metadata is registered before dynamic id route', () => {
  assert.ok(source.indexOf("app.get('/profiles'") < source.indexOf("app.get('/:id'"))
})
