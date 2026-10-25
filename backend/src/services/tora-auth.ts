import { AsyncLocalStorage } from 'node:async_hooks'
import { randomBytes } from 'node:crypto'
import { Hono, type MiddlewareHandler } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { normalizeToraConfigs, publicToraConfig, type ToraConfig } from './tora-configs.js'
import { parseToraModelCatalog, buildToraModelConfigs, groupToraModels, type ToraModel } from './tora-model-catalog.js'

interface Session {
  remoteCookie: string
  apiKey: string
  configs: ToraConfig[]
  catalog: ToraModel[]
  expiresAt: number
}
interface Options {
  authBase: string
  gateways: Record<string, string>
  modelBase?: string
  fetchImpl?: typeof fetch
  clock?: () => number
  ttlMs?: number
}

/** Local integration with the existing Tora login service, not an account/password issuer.
 * Sessions and keys are held in process memory. Restart requires logging in again.
 * Do not deploy with authBase pointing back at this same application.
 */
export function createToraAuth(options: Options) {
  const base = options.authBase.replace(/\/$/, '')
  const upstream = new URL(base)
  if (upstream.protocol !== 'https:' || upstream.username || upstream.password || upstream.search || upstream.hash) throw new Error('Tora auth upstream must be an HTTPS URL')
  const modelBase = (options.modelBase || options.gateways.openai || upstream.origin).replace(/\/$/, '')
  const modelOrigin = new URL(modelBase)
  if (modelOrigin.protocol !== 'https:' || modelOrigin.username || modelOrigin.password || modelOrigin.search || modelOrigin.hash) throw new Error('Invalid ToraAPI model endpoint')
  const fetchImpl = options.fetchImpl || fetch
  const clock = options.clock || Date.now
  const ttlMs = options.ttlMs || 8 * 60 * 60 * 1000
  const sessions = new Map<string, Session>()
  const context = new AsyncLocalStorage<Session | null>()
  const refreshes = new WeakMap<Session, Promise<void>>()
  const routes = new Hono()
  const configRoutes = new Hono()
  const cookieName = 'tora_session'
  const allowedOrigins = new Set((process.env.TORA_ALLOWED_ORIGINS || '').split(',').filter(Boolean))

  function readSession(c: Parameters<MiddlewareHandler>[0]) {
    const id = getCookie(c, cookieName)
    const session = id ? sessions.get(id) : undefined
    if (!session || session.expiresAt <= clock()) {
      if (id) sessions.delete(id)
      return null
    }
    return session
  }
  async function remote(path: string, init: RequestInit) {
    const response = await fetchImpl(`${base}${path}`, { ...init, redirect: 'error', signal: AbortSignal.timeout(20000) })
    const json = await response.json()
    if (!response.ok || (json.code && json.code >= 400)) {
      throw new Error(response.status === 401 || response.status === 403 ? 'unauthorized' : 'upstream')
    }
    return { response, data: json.data ?? json }
  }
  async function refresh(session: Session) {
    const current = refreshes.get(session)
    if (current) return current
    const pending = performRefresh(session)
    refreshes.set(session, pending)
    try { await pending } finally { if (refreshes.get(session) === pending) refreshes.delete(session) }
  }
  async function performRefresh(session: Session) {
    try {
      const headers = { Authorization: `Bearer ${session.apiKey}`, Accept: 'application/json' }
      const [modelResponse, metadataResponse, configResponse] = await Promise.all([
        fetchImpl(`${modelBase}/v1/models`, { headers, redirect: 'error', signal: AbortSignal.timeout(20000) }),
        fetchImpl(new URL('/api/pricing', modelBase).toString(), { redirect: 'error', signal: AbortSignal.timeout(20000) }),
        remote('/ai-configs', { headers: { Cookie: session.remoteCookie, Accept: 'application/json' } }),
      ])
      if (modelResponse.status === 401 || modelResponse.status === 403) throw new Error('unauthorized')
      if (!modelResponse.ok) throw new Error('models unavailable')
      const modelJson = await modelResponse.json()
      if (modelJson.code && modelJson.code >= 400) throw new Error(modelJson.code === 401 || modelJson.code === 403 ? 'unauthorized' : 'models unavailable')
      const metadata = metadataResponse.ok ? await metadataResponse.json() : { data: [] }
      const catalog = parseToraModelCatalog(modelJson, metadata)
      const previous = normalizeToraConfigs(configResponse.data, session.apiKey, options.gateways)
      const configs = buildToraModelConfigs(catalog, session.apiKey, modelBase, previous)
      session.catalog = catalog
      session.configs = configs
    } catch (error) {
      session.catalog = []
      session.configs = []
      if (error instanceof Error && error.message === 'unauthorized') {
        for (const [id, stored] of sessions) if (stored === session) sessions.delete(id)
        session.apiKey = ''
        session.remoteCookie = ''
      }
      throw error
    }
  }

  routes.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    if (c.req.method === 'POST') {
      const origin = c.req.header('Origin')
      if (origin && origin !== new URL(c.req.url).origin && !allowedOrigins.has(origin)) return c.json({ code: 403, message: 'Origin not allowed' }, 403)
    }
    await next()
  })
  routes.post('/login', async c => {
    const body = await c.req.json().catch(() => null)
    const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : ''
    if (!apiKey || apiKey.length > 4096) return c.json({ code: 400, message: 'ToraAPI key is required' }, 400)
    // Prevent recursive login calls when this local integration is deployed behind the upstream URL.
    if (new URL(c.req.url).origin === upstream.origin) return c.json({ code: 503, message: 'Configure a separate Tora authentication upstream' }, 503)
    for (const [id, session] of sessions) if (session.expiresAt <= clock()) sessions.delete(id)
    if (sessions.size >= 1000) return c.json({ code: 503, message: 'Session capacity reached' }, 503)
    try {
      const { response } = await remote('/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey }),
      })
      const remoteCookie = response.headers.getSetCookie().map(value => value.split(';')[0]).filter(value => value.includes('=')).join('; ')
      if (!remoteCookie) throw new Error('upstream')
      const session: Session = { remoteCookie, apiKey, configs: [], catalog: [], expiresAt: clock() + ttlMs }
      await refresh(session)
      const previous = getCookie(c, cookieName)
      if (previous) sessions.delete(previous)
      const id = randomBytes(32).toString('hex')
      sessions.set(id, session)
      setCookie(c, cookieName, id, { httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Strict', path: '/', maxAge: Math.floor(ttlMs / 1000) })
      return c.json({ code: 200, data: { authenticated: true, configured_services: [...new Set(session.configs.map(r => r.serviceType))] }, message: 'success' })
    } catch (error) {
      const rejected = error instanceof Error && error.message === 'unauthorized'
      return c.json({ code: rejected ? 401 : 502, message: rejected ? 'ToraAPI login rejected' : 'ToraAPI authentication service unavailable' }, rejected ? 401 : 502)
    }
  })
  routes.get('/me', c => c.json({ code: 200, data: { authenticated: Boolean(readSession(c)), managed: isToraWebMode() }, message: 'success' }))
  routes.get('/models', c => {
    const session = readSession(c)
    if (!session) return c.json({ code: 401, message: 'Please login to ToraAPI' }, 401)
    return c.json({ code: 200, data: { ...groupToraModels(session.catalog), source: '/v1/models' }, message: 'success' })
  })
  routes.post('/logout', c => {
    const id = getCookie(c, cookieName)
    if (id) sessions.delete(id)
    deleteCookie(c, cookieName, { path: '/' })
    return c.json({ code: 200, data: { authenticated: false }, message: 'success' })
  })

  configRoutes.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    await next()
  })
  configRoutes.get('/', async c => {
    const session = context.getStore()
    if (!session) return c.json({ code: 200, data: [], message: 'success' })
    try {
      await refresh(session)
      const type = c.req.query('service_type')
      return c.json({ code: 200, data: session.configs.filter(r => !type || r.serviceType === type).map(publicToraConfig), message: 'success' })
    } catch (error) {
      const rejected = error instanceof Error && error.message === 'unauthorized'
      return c.json({ code: rejected ? 401 : 502, message: 'Unable to refresh ToraAPI models; cached configs were cleared' }, rejected ? 401 : 502)
    }
  })
  configRoutes.get('/profiles', c => c.json({ code: 200, data: { profiles: (context.getStore()?.configs || []).map(publicToraConfig) }, message: 'success' }))
  configRoutes.get('/:id', c => {
    const config = context.getStore()?.configs.find(r => r.id === Number(c.req.param('id')))
    return config ? c.json({ code: 200, data: publicToraConfig(config), message: 'success' }) : c.json({ code: 404, message: 'Config not found' }, 404)
  })
  // Remote managed configs are read-only here; never fall through to another user's local DB.
  configRoutes.all('*', c => c.json({ code: 409, message: 'Managed ToraAPI configurations are read-only in local integration mode' }, 409))
  const middleware: MiddlewareHandler = async (c, next) => context.run(readSession(c), next)
  return { routes, configRoutes, middleware, currentConfigs: () => { const session = context.getStore(); return session?.apiKey ? session.configs : undefined } }
}

export const toraAuth = createToraAuth({
  authBase: process.env.TORA_AUTH_API_BASE_URL || 'https://www.toraapi.com/storyvdo/api/v1',
  // Only documented compatible text/image protocols are enabled. Native video gateway mapping is not verified.
  gateways: { openai: 'https://www.toraapi.com', gemini: 'https://www.toraapi.com' },
})

export function isToraWebMode() { return process.env.TORA_WEB_MODE === '1' }
