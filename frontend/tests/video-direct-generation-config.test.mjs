import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const settingsPage = readFileSync(new URL('../app/pages/settings.vue', import.meta.url), 'utf8')
const aiConfigRoute = readFileSync(new URL('../../backend/src/routes/aiConfigs.ts', import.meta.url), 'utf8')
const volcengineAdapter = readFileSync(new URL('../../backend/src/services/adapters/volcengine-video.ts', import.meta.url), 'utf8')

test('video presets default to direct Seedance 2.0 generation (server-side)', () => {
  const combined = `${settingsPage}\n${aiConfigRoute}\n${volcengineAdapter}`
  assert.doesNotMatch(combined, /doubao-seedance-1-5-pro-251215/)
  assert.match(settingsPage, /doubao-seedance-2-0-260128/)
  assert.match(settingsPage, /doubao-seedance-2-0-fast-260128/)
  assert.match(settingsPage, /doubao-seedance-2-0-mini-260615/)
})

test('video presets use official provider endpoints (server-side)', () => {
  const presetsStart = settingsPage.indexOf('const providerPresets = computed')
  const presetsEnd = settingsPage.indexOf('const antigravityQuickConfigs', presetsStart)
  assert.notEqual(presetsStart, -1)
  assert.ok(presetsEnd > presetsStart)
  const providerPresets = settingsPage.slice(presetsStart, presetsEnd)
  assert.doesNotMatch(providerPresets, /api\.firemux\.com/)
  assert.match(settingsPage, /https:\/\/ark\.cn-beijing\.volces\.com/)
  assert.match(settingsPage, /https:\/\/\{WorkspaceId\}\.cn-beijing\.maas\.aliyuncs\.com/)
  assert.doesNotMatch(settingsPage, /https:\/\/dashscope\.aliyuncs\.com/)
  assert.doesNotMatch(settingsPage, /https:\/\/api\.vidu\.com/)
})

test('ToraAPI login flow only uses authAPI and loadCfgs (no manual config creation)', () => {
  const loginStart = settingsPage.indexOf('async function loginTora')
  const logoutStart = settingsPage.indexOf('async function logoutTora')
  const loginSlice = settingsPage.slice(loginStart, logoutStart)
  assert.doesNotMatch(loginSlice, /aiConfigAPI\.create/)
  assert.doesNotMatch(loginSlice, /api\.firemux\.com/)
  assert.match(loginSlice, /await authAPI\.login\(apiKey\)/)
  assert.match(loginSlice, /await authAPI\.me\(\)/)
  assert.match(loginSlice, /await loadCfgs\(true\)/)
})