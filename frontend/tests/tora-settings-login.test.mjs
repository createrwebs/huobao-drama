import { test } from 'node:test'
import assert from 'node:assert/strict'
import { settingsHarness, settingsSource } from './helpers/settings-harness.mjs'

test('ToraAPI is the default provider and login reloads server-seeded configs without client creates', async () => {
  const { state, calls } = settingsHarness()
  assert.equal(state.quickProviderTab.value, 'tora')
  assert.equal(typeof state.loginTora, 'function')
  state.toraApiKey.value = '  test-only-tora-key  '
  await state.loginTora()
  assert.deepEqual(calls.filter(([name]) => ['login', 'me', 'list', 'create', 'update'].includes(name)), [
    ['login', 'test-only-tora-key'], ['me'], ['list'],
  ])
  assert.equal(state.toraAuthenticated.value, true)
  assert.equal(state.toraApiKey.value, '')
  assert.equal(state.toraBusy.value, false)
  assert.match(settingsSource, /<form[^>]*@submit\.prevent="loginTora"/)
  assert.match(settingsSource, /v-model="toraApiKey"[^>]*type="password"/)
})

test('failed ToraAPI login clears the key and shows a safe localized error', async () => {
  for (const login of [async () => { throw new Error('provider echoed test-only-key') }, async () => {}]) {
    const { state, calls } = settingsHarness({ authAPI: { login, me: async () => ({ authenticated: false }) } })
    state.toraApiKey.value = 'test-only-key'
    await state.loginTora()
    assert.equal(state.toraApiKey.value, '')
    assert.equal(state.toraAuthenticated.value, false)
    assert.equal(state.toraBusy.value, false)
    assert.equal(state.toraError.value, 'settings.ai.toraLoginFailed')
    assert.ok(!calls.some(([name]) => name === 'list' || name === 'success'))
    assert.match(settingsSource, /v-if="toraError"[^>]*role="alert"/)
  }
})

test('settings restores the server session without probing local providers by default', async () => {
  const { state, calls, mounted, intervals } = settingsHarness()
  await Promise.all(mounted.map(callback => callback()))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(state.toraAuthenticated.value, true)
  assert.equal(state.toraChecking.value, false)
  assert.equal(calls.filter(([name]) => name === 'me').length, 1)
  assert.ok(!calls.some(([name]) => ['status', 'accounts', 'test', 'create', 'update'].includes(name)))
  for (const callback of intervals) await callback()
  assert.ok(!calls.some(([name]) => ['status', 'accounts', 'test'].includes(name)))
})

test('ToraAPI logout verifies the ended session and reloads configs', async () => {
  const events = []
  const { state, calls } = settingsHarness({ authAPI: {
    logout: async () => events.push('logout'),
    me: async () => { events.push('me'); return { authenticated: false } },
  } })
  assert.equal(typeof state.logoutTora, 'function')
  state.toraAuthenticated.value = true
  state.toraApiKey.value = 'unsent-key'
  await state.logoutTora()
  assert.deepEqual(events, ['logout', 'me'])
  assert.equal(state.toraAuthenticated.value, false)
  assert.equal(state.toraApiKey.value, '')
  assert.equal(state.toraBusy.value, false)
  assert.ok(calls.some(([name]) => name === 'list'))
  assert.match(settingsSource, /@click="logoutTora"/)
})

test('managed login page does not fetch protected editor data before authentication', async () => {
  const { calls, mounted } = settingsHarness({ authAPI: { me: async () => ({ authenticated: false, managed: true }) } })
  await Promise.all(mounted.map(callback => callback()))
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(!calls.some(([name]) => ['list', 'get'].includes(name)), 'protected editor data must not load before login')
  assert.match(settingsSource, /v-if="!toraManagedMode"/)
})

test('post-login model loading failure cannot report setup success or keep stale configs', async () => {
  const { state, calls } = settingsHarness({ aiConfigAPI: { list: async () => { throw new Error('fixture catalog failure') } } })
  state.toraApiKey.value = 'fixture-key'
  state.cfgs.value = [{ id: 99, model: ['stale-model'] }]
  await state.loginTora()
  assert.equal(state.cfgs.value.length, 0)
  assert.ok(state.toraError.value)
  assert.ok(!calls.some(([name]) => name === 'success'))
})

test('managed refresh revocation clears connected state and requires login again', async () => {
  const error = new Error('session expired')
  error.status = 401
  const { state } = settingsHarness({
    aiConfigAPI: { list: async () => { throw error } },
  })
  state.toraAuthenticated.value = true
  state.toraManagedMode.value = true
  await state.loadCfgs(true).catch(() => {})
  assert.equal(state.toraAuthenticated.value, false)
  assert.equal(state.cfgs.value.length, 0)
  assert.equal(state.toraCatalog.value.chat.length, 0)
  assert.equal(state.toraError.value, 'settings.ai.toraSessionExpired')
})

test('managed login loads and separates the live Chat/Image/VDO catalog', async () => {
  const catalog = { chat: [{ id: 'live-chat' }], image: [{ id: 'live-image' }], vdo: [{ id: 'live-video' }], unknown: [] }
  let modelReads = 0
  const { state } = settingsHarness({ authAPI: {
    login: async () => {}, me: async () => ({ authenticated: true, managed: true }),
    models: async () => { modelReads++; return catalog },
  } })
  state.toraApiKey.value = 'fixture-model-key'
  await state.loginTora()
  assert.equal(modelReads, 1)
  assert.equal(state.toraManagedMode.value, true)
  assert.equal(state.toraCatalog.value.chat[0].id, 'live-chat')
  assert.equal(state.toraCatalog.value.image[0].id, 'live-image')
  assert.equal(state.toraCatalog.value.vdo[0].id, 'live-video')
  assert.equal(state.toraApiKey.value, '')
  assert.match(settingsSource, /v-for="group in toraCatalogGroups"/)
})

test('empty and duplicate login submissions never send extra credentials', async () => {
  let resolveLogin
  let logins = 0
  const { state } = settingsHarness({ authAPI: {
    login: () => { logins++; return new Promise(resolve => { resolveLogin = resolve }) },
    me: async () => ({ authenticated: true }),
  } })
  state.toraApiKey.value = '   '
  await state.loginTora()
  assert.equal(logins, 0)
  state.toraApiKey.value = 'test-only-key'
  const pending = state.loginTora()
  assert.equal(state.toraBusy.value, true)
  await state.loginTora()
  assert.equal(logins, 1)
  resolveLogin()
  await pending
  assert.equal(state.toraBusy.value, false)
})
