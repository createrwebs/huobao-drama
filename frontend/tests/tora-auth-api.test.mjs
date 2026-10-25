import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import ts from 'typescript'

function client({ baseURL = '/', response = { authenticated: true }, status = 200, failure } = {}) {
  const source = readFileSync(new URL('../app/composables/useApi.ts', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const requests = []
  const logs = []
  const exports = {}
  vm.runInNewContext(code, {
    exports, performance,
    useRuntimeConfig: () => ({ app: { baseURL } }),
    console: { log: (...args) => logs.push(args) },
    fetch: async (url, options) => {
      requests.push({ url, options })
      if (failure) throw failure
      return { ok: status < 400, status, json: async () => response }
    },
  })
  return { ...exports, requests, logs }
}

test('auth API exchanges the key once and checks and ends the server session', async () => {
  const { authAPI, requests } = client()
  assert.ok(authAPI, 'authAPI must be exported')
  await authAPI.login('test-only-key')
  await authAPI.me()
  await authAPI.logout()
  assert.deepEqual(requests.map(r => [r.url, r.options.method]), [
    ['/api/v1/auth/login', 'POST'], ['/api/v1/auth/me', 'GET'], ['/api/v1/auth/logout', 'POST'],
  ])
  assert.deepEqual(JSON.parse(requests[0].options.body), { apiKey: 'test-only-key' })
  assert.equal(requests[1].options.body, undefined)
  assert.equal(requests[2].options.body, undefined)
  assert.ok(requests.every(r => r.options.credentials === 'same-origin'))
})

test('API requests respect the deployed application base path', async () => {
  for (const baseURL of ['/studio/', '/studio']) {
    const { authAPI, requests } = client({ baseURL })
    await authAPI.me()
    assert.equal(requests[0].url, '/studio/api/v1/auth/me')
  }
})

test('API logging never exposes request secrets or echoed error payloads', async () => {
  const secret = 'test-only-secret-should-not-appear'
  const success = client()
  await success.authAPI.login(secret)
  await success.api.post('/flow-bridge/accounts/import', { cookies: [{ value: secret }], at: secret })
  const rejected = client({ status: 401, response: { message: `Invalid key ${secret}` } })
  await assert.rejects(() => rejected.authAPI.login(secret))
  const network = client({ failure: new Error(`Transport echoed ${secret}`) })
  await assert.rejects(() => network.authAPI.login(secret))
  assert.doesNotMatch(JSON.stringify([...success.logs, ...rejected.logs, ...network.logs]), new RegExp(secret))
})

export { client }
