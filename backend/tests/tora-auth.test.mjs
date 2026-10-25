import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'

const rows = [
  { id: 1, provider: 'openai', service_type: 'text', name: 'Huobao Text', base_url: 'https://api.firemux.com', model: ['example-text-model'], is_active: true, priority: 100 },
  { id: 2, provider: 'gemini', service_type: 'image', name: 'Huobao Image', base_url: 'https://api.firemux.com', model: ['example-image-model'], is_active: true },
  { id: 3, provider: 'google_flow', service_type: 'image', base_url: 'http://127.0.0.1:5679', model: ['local-model'], is_active: true },
]
async function harness(options = {}) {
  const { createToraAuth } = await import('../src/services/tora-auth.ts')
  const remote = []
  const auth = createToraAuth({
    authBase: 'https://upstream.example/api/v1',
    gateways: { openai: 'https://gateway.example', gemini: 'https://gateway.example' },
    fetchImpl: async (url, init) => {
      remote.push({ url, init })
      if (url.endsWith('/auth/login')) {
        const { apiKey } = JSON.parse(init.body)
        if (apiKey === 'invalid-fixture') return Response.json({ code: 401, message: apiKey }, { status: 401 })
        return Response.json({ code: 200, data: { user: { id: apiKey } } }, { headers: { 'set-cookie': `remote_session=${apiKey}; HttpOnly; Path=/` } })
      }
      if (url.endsWith('/v1/models')) {
        if (options.catalogDelay) await new Promise(resolve => setTimeout(resolve, options.catalogDelay))
        const status = options.catalogStatus?.() || 200
        if (status !== 200) return Response.json({ code: status, message: 'catalog unavailable' }, { status })
        assert.match(init.headers.Authorization, /^Bearer fixture-/)
        return Response.json({ object: 'list', data: [{ id: 'example-text-model' }, { id: 'example-image-model' }, { id: 'veo-authorized-fixture' }] })
      }
      if (url.endsWith('/api/pricing')) return Response.json({ data: [
        { model_name: 'example-text-model', supported_endpoint_types: ['openai'] },
        { model_name: 'example-image-model', supported_endpoint_types: ['image-generation'] },
        { model_name: 'veo-authorized-fixture', supported_endpoint_types: ['video-generation'] },
        { model_name: 'public-but-not-in-key-catalog', supported_endpoint_types: ['openai'] },
      ] })
      assert.ok(init.headers.Cookie.startsWith('remote_session='))
      return Response.json({ code: 200, data: rows })
    },
    ...options,
  })
  const app = new Hono()
  app.use('*', auth.middleware)
  app.route('/auth', auth.routes)
  app.route('/ai-configs', auth.configRoutes)
  app.get('/runtime', c => c.json(auth.currentConfigs()?.map(r => ({ model: r.model, key: r.apiKey })) || []))
  return { app, remote, auth }
}
const login = (app, key) => app.request('http://localhost/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: key }) })
const cookieOf = response => response.headers.get('set-cookie')?.split(';')[0]

test('login exchanges the key and returns masked, nonlocal configs without leaking upstream cookie', async () => {
  const { app, remote } = await harness()
  const response = await login(app, 'fixture-key-one')
  assert.equal(response.status, 200)
  const cookie = cookieOf(response)
  assert.match(cookie, /^tora_session=/)
  assert.ok(!cookie.includes('fixture-key-one'))
  assert.match(response.headers.get('set-cookie'), /HttpOnly/)
  const list = await app.request('http://localhost/ai-configs', { headers: { Cookie: cookie } })
  const visible = await list.json()
  assert.equal(visible.data.length, 2)
  assert.ok(!/fixture-key|remote_session|Huobao|Firemux|127\.0\.0\.1/.test(JSON.stringify(visible)))
  assert.equal(visible.data[0].api_key_configured, true)
  assert.deepEqual(JSON.parse(remote[0].init.body), { apiKey: 'fixture-key-one' })
  assert.ok(remote.some(r => r.url.endsWith('/v1/models')), 'Login must query the key-scoped model catalog')
  const modelResponse = await app.request('http://localhost/auth/models', { headers: { Cookie: cookie } })
  assert.equal(modelResponse.status, 200)
  const modelData = (await modelResponse.json()).data
  assert.deepEqual(modelData.chat.map(m => m.id), ['example-text-model'])
  assert.deepEqual(modelData.image.map(m => m.id), ['example-image-model'])
  assert.deepEqual(modelData.vdo.map(m => m.id), ['veo-authorized-fixture'])
  assert.ok(!JSON.stringify(modelData).includes('public-but-not-in-key-catalog'))
})

test('invalid login never issues a cookie and errors do not echo the supplied key', async () => {
  const { app } = await harness()
  const response = await login(app, 'invalid-fixture')
  assert.equal(response.status, 401)
  assert.equal(response.headers.get('set-cookie'), null)
  assert.ok(!(await response.text()).includes('invalid-fixture'))
})

test('two logged-in clients have independent runtime keys and logout cannot expose another session', async () => {
  const { app } = await harness()
  const a = cookieOf(await login(app, 'fixture-a'))
  const b = cookieOf(await login(app, 'fixture-b'))
  const request = cookie => app.request('http://localhost/runtime', { headers: { Cookie: cookie } }).then(r => r.json())
  const [ra, rb] = await Promise.all([request(a), request(b)])
  assert.equal(ra[0].key, 'fixture-a')
  assert.equal(rb[0].key, 'fixture-b')
  await app.request('http://localhost/auth/logout', { method: 'POST', headers: { Cookie: a } })
  const me = await app.request('http://localhost/auth/me', { headers: { Cookie: a } })
  assert.equal((await me.json()).data.authenticated, false)
  assert.equal((await request(b))[0].key, 'fixture-b')
})

test('catalog revocation invalidates the session and refresh failure clears runtime models', async () => {
  for (const failureStatus of [401, 503]) {
    let status = 200
    const { app } = await harness({ catalogStatus: () => status })
    const cookie = cookieOf(await login(app, 'fixture-catalog-refresh'))
    status = failureStatus
    const list = await app.request('http://localhost/ai-configs', { headers: { Cookie: cookie } })
    assert.equal(list.status, failureStatus === 401 ? 401 : 502)
    const runtime = await app.request('http://localhost/runtime', { headers: { Cookie: cookie } })
    assert.equal((await runtime.json())?.length || 0, 0, 'Stale models must not be usable')
    if (failureStatus === 401) {
      const me = await app.request('http://localhost/auth/me', { headers: { Cookie: cookie } })
      assert.equal((await me.json()).data.authenticated, false)
    }
  }
})

test('concurrent config refreshes share one upstream catalog request', async () => {
  const { app, remote } = await harness({ catalogDelay: 15 })
  const cookie = cookieOf(await login(app, 'fixture-concurrent'))
  remote.length = 0
  const [first, second] = await Promise.all([
    app.request('http://localhost/ai-configs', { headers: { Cookie: cookie } }),
    app.request('http://localhost/ai-configs', { headers: { Cookie: cookie } }),
  ])
  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  assert.equal(remote.filter(r => r.url.endsWith('/v1/models')).length, 1)
})

test('expired sessions and cross-origin login are rejected', async () => {
  let time = 100
  const { app } = await harness({ clock: () => time, ttlMs: 50 })
  const cookie = cookieOf(await login(app, 'fixture-expiring'))
  time += 51
  const list = await app.request('http://localhost/ai-configs', { headers: { Cookie: cookie } })
  assert.deepEqual((await list.json()).data, [])
  const response = await app.request('http://localhost/auth/login', { method: 'POST', headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: 'fixture-key' }) })
  assert.equal(response.status, 403)
})
