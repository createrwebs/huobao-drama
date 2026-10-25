import { Hono } from 'hono'
import { eq, and, ne } from 'drizzle-orm'
import { db, getInsertId, schema } from '../db/index.js'
import { success, notFound, created, badRequest, now } from '../utils/response.js'
import { toSnakeCase } from '../utils/transform.js'
import { joinProviderUrl } from '../services/adapters/url.js'
import { isOfficialProvider, parseConfigTemperature } from '../services/ai.js'
import { getContentLanguage } from '../services/app-settings.js'
import { redactUrl, logTaskError, logTaskProgress, logTaskSuccess } from '../utils/task-logger.js'

const app = new Hono()

/** 归一化 temperature 入参：null=未设置；合法值 0~2；非法抛错 */
function normalizeTemperature(v: any): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0 || n > 2) throw new Error('invalid temperature')
  return n
}

/** 把 settings JSON 中的 temperature 透出为顶层字段，便于前端直接读写 */
function withParsedFields(r: any) {
  const result = toSnakeCase(r)
  // API credentials are write-only. Returning the stored value made every
  // settings read, browser log and extension consumer a credential exfiltration
  // surface. The UI uses api_key_configured to render status and sends a new key
  // only when rotating it.
  delete result.api_key
  return {
    ...result,
    api_key: r.apiKey ? '********' : '',
    api_key_configured: Boolean(r.apiKey),
    model: r.model ? JSON.parse(r.model) : [],
    temperature: parseConfigTemperature(r.settings),
  }
}

function bearerHeaders(apiKey?: string, withJson = false) {
  const headers: Record<string, string> = {}
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  if (withJson) headers['Content-Type'] = 'application/json'
  return headers
}

function geminiHeaders(apiKey?: string, withJson = false) {
  const headers: Record<string, string> = {}
  if (apiKey) {
    headers['x-goog-api-key'] = apiKey
  }
  if (withJson) headers['Content-Type'] = 'application/json'
  return headers
}

function buildProbe(serviceType: string, provider: string, baseUrl: string, model?: string, apiKey?: string) {
  const p = provider.toLowerCase()
  const m = model || ''

  if (p === 'gemini') {
    // 探针统一走 generateContent:文本运行时(AI SDK)走的就是它,官方与中转站都支持;
    // interactions 端点很多中转站未配置,探它会误报 500。
    // 用最小合法请求体而非空体——空体在部分中转站会触发上游认证失败的误报
    const modelName = m || 'gemini-2.0-flash'
    const url = new URL(joinProviderUrl(baseUrl, '/v1beta', `/models/${modelName}:generateContent`))
    if (apiKey) url.searchParams.set('key', apiKey)
    return {
      method: 'POST',
      url: url.toString(),
      headers: geminiHeaders(apiKey, true),
      body: { contents: [{ parts: [{ text: 'hi' }] }] },
    }
  }

  if (p === 'openai') {
    if (serviceType === 'video') {
      return {
        method: 'POST',
        url: joinProviderUrl(baseUrl, '/v1', '/videos'),
        headers: bearerHeaders(apiKey, true),
        body: { model: m || 'wan3.0-video' },
      }
    }
    return {
      method: 'GET',
      url: joinProviderUrl(baseUrl, '/v1', '/models'),
      headers: bearerHeaders(apiKey),
      body: undefined,
    }
  }

  if (p === 'volcengine') {
    const path = serviceType === 'video'
      ? '/contents/generations/tasks'
      : serviceType === 'text'
        ? '/chat/completions'
        : '/images/generations'
    return {
      method: 'POST',
      url: joinProviderUrl(baseUrl, '/api/v3', path),
      headers: bearerHeaders(apiKey, true),
      body: {},
    }
  }

  if (p === 'minimax') {
    // MiniMax 仅提供视频服务，空请求体探测鉴权/端点连通性
    return {
      method: 'POST',
      url: joinProviderUrl(baseUrl, '/v2', '/video_generation'),
      headers: bearerHeaders(apiKey, true),
      body: {},
    }
  }

  if (p === 'aliyun') {
    // Wan 3.0 仅支持异步提交；空请求体不会创建计费任务，仅用于验证地域端点与鉴权是否可达。
    return {
      method: 'POST',
      url: joinProviderUrl(baseUrl, '/api/v1', '/services/aigc/video-generation/video-synthesis'),
      headers: {
        ...bearerHeaders(apiKey, true),
        'X-DashScope-Async': 'enable',
      },
      body: {},
    }
  }

  if (p === 'google_flow') {
    return {
      method: 'GET',
      url: joinProviderUrl(baseUrl, '', '/status'),
      headers: {},
      body: undefined,
    }
  }

  if (p === 'antigravity') {
    return {
      method: 'GET',
      url: joinProviderUrl(baseUrl, '/v1', '/models'),
      headers: bearerHeaders(apiKey || 'huobao-antigravity'),
      body: undefined,
    }
  }

  return {
    method: 'GET',
    url: joinProviderUrl(baseUrl, '', m ? `/${m}` : '/'),
    headers: bearerHeaders(apiKey),
    body: undefined,
  }
}

// GET /ai-configs?service_type=text
app.get('/', async (c) => {
  const serviceType = c.req.query('service_type')
  let rows = await db.select().from(schema.aiServiceConfigs)
  if (serviceType) rows = rows.filter(r => r.serviceType === serviceType)

  const parsed = rows.map(withParsedFields)
  return success(c, parsed)
})

// POST /ai-configs
app.post('/', async (c) => {
  const body = await c.req.json()
  const ts = now()

  // 验证必填字段
  if (!body.service_type || !body.provider) {
    return badRequest(c, '需要 service_type 与 provider')
  }
  if (!isOfficialProvider(body.service_type, body.provider)) {
    return badRequest(c, '不支持的 service_type/provider')
  }

  let temperature: number | null = null
  if ('temperature' in body) {
    try {
      temperature = normalizeTemperature(body.temperature)
    } catch {
      return badRequest(c, 'temperature 须为 0 到 2 之间的数字')
    }
  }

  const res = await db.insert(schema.aiServiceConfigs).values({
    serviceType: body.service_type,
    provider: body.provider,
    name: body.name || `${body.provider}-${body.service_type}`,
    baseUrl: body.base_url || '',
    apiKey: body.api_key || '',
    model: JSON.stringify(body.model || []),
    priority: body.priority || 0,
    isActive: true,
    settings: temperature !== null ? JSON.stringify({ temperature }) : null,
    createdAt: ts,
    updatedAt: ts,
  })

  const [row] = await db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.id, getInsertId(res)))

  return created(c, withParsedFields(row))
})

// POST /ai-configs/test — accepts optional config_id to test an existing config without re-sending the API key
app.post('/test', async (c) => {
  const body = await c.req.json()
  const configId = body.config_id ?? body.configId

  if (configId) {
    // Load the existing config and probe with its stored key (never exposed)
    const [existing] = await db.select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, Number(configId)))
    if (!existing) return badRequest(c, 'Config not found')
    if (!isOfficialProvider(existing.serviceType, existing.provider)) return badRequest(c, 'Unsupported provider')

    const model = Array.isArray(body.model) ? body.model[0] : body.model || (existing.model ? JSON.parse(existing.model)[0] : '')
    const probe = buildProbe(existing.serviceType, existing.provider || '', existing.baseUrl, model, existing.apiKey)
    const probeUrl = redactUrl(probe.url)

    logTaskProgress('AIConfig', 'probe-start', {
      serviceType: existing.serviceType,
      provider: existing.provider,
      configId: existing.id,
      method: probe.method,
      url: probeUrl,
    })

    try {
      const resp = await fetch(probe.url, {
        method: probe.method,
        headers: probe.headers,
        body: probe.body ? JSON.stringify(probe.body) : undefined,
      })
      const text = await resp.text()
      const reachable = [200, 204, 400, 401, 402, 403, 422, 429, 503].includes(resp.status)
      const lang = getContentLanguage()

      let probeMessage = ''
      if (resp.ok) probeMessage = lang === 'th' ? 'เชื่อมต่อสำเร็จ การยืนยันตัวตนและเส้นทางถูกต้อง' : '端点可访问，认证与路径基本正常'
      else if (resp.status === 402 || /prepayment.*depleted|credits are depleted/i.test(text)) probeMessage = lang === 'th' ? 'เครดิต API หมด (Prepayment credits depleted) กรุณาตรวจสอบยอดเงินใน Google AI Studio หรือสร้าง API Key ในโปรเจกต์ Free Tier' : 'API 预付款额度已耗尽 (402 Prepayment Depleted)，请在 Google AI Studio 检查账单或创建免费项目 Key'
      else if (resp.status === 401 || resp.status === 403) probeMessage = lang === 'th' ? 'การยืนยันตัวตนล้มเหลว หรือไม่มีสิทธิ์เข้าถึงโมเดลนี้ กรุณาตรวจสอบ API Key และสิทธิ์โมเดล' : '认证失败或无权限访问该模型，请检查 API Key'
      else if (resp.status === 429) probeMessage = lang === 'th' ? 'คำขอมากเกินไปหรือโควต้าไม่เพียงพอ (Rate Limit)' : '请求过于频繁或配额耗尽 (Rate Limit)'
      else if (resp.status === 400 || resp.status === 422) probeMessage = lang === 'th' ? 'เซิร์ฟเวอร์ตอบกลับแล้ว แต่พารามิเตอร์ไม่ถูกต้อง' : '端点已响应，请根据状态码判断认证或路径是否正确'
      else if (resp.status === 503 || /overloaded/i.test(text)) probeMessage = lang === 'th' ? 'เซิร์ฟเวอร์ปลายทางกำลังโหลดสูงชั่วคราว (CPU Overloaded) กรุณารอสักครู่แล้วลองใหม่' : '服务商服务器高负载，请稍后重试'
      else probeMessage = lang === 'th' ? 'เซิร์ฟเวอร์ไม่ตอบสนองตามที่คาดไว้ กรุณาตรวจสอบ Base URL' : '端点未按预期响应，请检查 Base URL 和代理前缀'

      const payload = { ok: resp.ok, reachable, status: resp.status, status_text: resp.statusText, method: probe.method, url: probeUrl, message: probeMessage, response_preview: text.slice(0, 240) }
      if (reachable) logTaskSuccess('AIConfig', 'probe-done', { provider: existing.provider, configId: existing.id, status: resp.status, url: probeUrl })
      else logTaskError('AIConfig', 'probe-unexpected', { provider: existing.provider, configId: existing.id, status: resp.status, url: probeUrl })
      return success(c, payload)
    } catch (error: any) {
      logTaskError('AIConfig', 'probe-failed', { provider: existing.provider, configId: existing.id, url: probeUrl, error: error.message })
      return success(c, { ok: false, reachable: false, method: probe.method, url: probeUrl, message: error.message || '请求失败', response_preview: '' })
    }
  }

  // Legacy: test with provided credentials (for new config creation flow)
  if (!body.service_type || !body.provider || !body.base_url) {
    return badRequest(c, '需要 service_type、provider 与 base_url')
  }
  if (!isOfficialProvider(body.service_type, body.provider)) {
    return badRequest(c, '不支持的 service_type/provider')
  }

  const model = Array.isArray(body.model) ? body.model[0] : body.model
  const probe = buildProbe(body.service_type, body.provider, body.base_url, model, body.api_key)
  const probeUrl = redactUrl(probe.url)

  logTaskProgress('AIConfig', 'probe-start', {
    serviceType: body.service_type,
    provider: body.provider,
    method: probe.method,
    url: probeUrl,
  })

  try {
    const resp = await fetch(probe.url, {
      method: probe.method,
      headers: probe.headers,
      body: probe.body ? JSON.stringify(probe.body) : undefined,
    })
    const text = await resp.text()
    const reachable = [200, 204, 400, 401, 402, 403, 422, 429].includes(resp.status)
    const lang = getContentLanguage()

    let probeMessage = ''
    if (resp.ok) probeMessage = lang === 'th' ? 'เชื่อมต่อสำเร็จ การยืนยันตัวตน和路径基本正常' : '端点可访问，认证与路径基本正常'
    else if (resp.status === 402 || /prepayment.*depleted|credits are depleted/i.test(text)) probeMessage = lang === 'th' ? 'เครดิต API หมด (Prepayment credits depleted) กรุณาตรวจสอบยอดเงิน在 Google AI Studio 或 创建 API Key 在 免费 项目' : 'API 预付款额度已耗尽 (402 Prepayment Depleted)，请在 Google AI Studio 检查账单或创建免费项目 Key'
    else if (resp.status === 401 || resp.status === 403) probeMessage = lang === 'th' ? 'การยืนยันตัวตนล้มเหลว กรุณาตรวจสอบ API Key' : '认证失败，请检查 API Key'
    else if (resp.status === 429) probeMessage = lang === 'th' ? 'คำขอมากเกินไปหรือโควต้า不足 (Rate Limit)' : '请求过于频繁或配额耗尽 (Rate Limit)'
    else if (resp.status === 400) probeMessage = lang === 'th' ? 'เซิร์ฟเวอร์ตอบกลับแล้ว แต่พารามิเตอร์不正确' : '端点已响应，请根据状态码判断认证或路径是否正确'
    else probeMessage = lang === 'th' ? 'เซิร์ฟเวอร์ไม่ตอบสนองตาม预期 กรุณาตรวจสอบ Base URL' : '端点未按预期响应，请检查 Base URL 和代理前缀'

    const payload = { ok: resp.ok, reachable, status: resp.status, status_text: resp.statusText, method: probe.method, url: probeUrl, message: probeMessage, response_preview: text.slice(0, 240) }
    if (reachable) logTaskSuccess('AIConfig', 'probe-done', { provider: body.provider, status: resp.status, url: probeUrl })
    else logTaskError('AIConfig', 'probe-unexpected', { provider: body.provider, status: resp.status, url: probeUrl })
    return success(c, payload)
  } catch (error: any) {
    logTaskError('AIConfig', 'probe-failed', { provider: body.provider, url: probeUrl, error: error.message })
    return success(c, { ok: false, reachable: false, method: probe.method, url: probeUrl, message: error.message || '请求失败', response_preview: '' })
  }
})

// POST /ai-configs/credit — check remaining balance/credits from ToraAPI / OpenAI billing endpoint
app.post('/credit', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  let apiKey = body.api_key ?? body.apiKey
  let baseUrl = body.base_url ?? body.baseUrl
  const configId = body.config_id ?? body.configId

  if (!apiKey && configId) {
    const [existing] = await db.select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, Number(configId)))
    if (existing?.apiKey) {
      apiKey = existing.apiKey
      if (!baseUrl) baseUrl = existing.baseUrl
    }
  }

  if (!apiKey) {
    // Find active config for tora / openai
    const activeConfigs = await db.select().from(schema.aiServiceConfigs)
      .where(eq(schema.aiServiceConfigs.isActive, true))

    const matched = activeConfigs.find(x => (x.baseUrl && x.baseUrl.includes('toraapi')) || (x.name && x.name.toLowerCase().includes('tora')))
      || activeConfigs.find(x => x.provider === 'openai' && x.apiKey)
      || activeConfigs.find(x => Boolean(x.apiKey && x.provider && !['antigravity', 'google_flow'].includes(x.provider)))

    if (matched?.apiKey) {
      apiKey = matched.apiKey
      if (!baseUrl) baseUrl = matched.baseUrl
    }
  }

  if (!apiKey) {
    return success(c, { ok: false, credit: 0, message: 'No API key provided or configured' })
  }

  const cleanBase = (baseUrl || 'https://www.toraapi.com').replace(/\/v1\/?$/, '').replace(/\/+$/, '')

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const [subRes, usageRes] = await Promise.all([
      fetch(`${cleanBase}/v1/dashboard/billing/subscription`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      }).catch((e) => ({ ok: false, status: 500, json: async () => ({ error: { message: e.message } }) })),
      fetch(`${cleanBase}/v1/dashboard/billing/usage?start_date=2024-01-01&end_date=2030-01-01`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      }).catch((e) => ({ ok: false, status: 500, json: async () => ({ error: { message: e.message } }) })),
    ])

    clearTimeout(timeout)

    let subJson: any = {}
    let usageJson: any = {}
    if ('json' in subRes) {
      try { subJson = await subRes.json() } catch {}
    }
    if ('json' in usageRes) {
      try { usageJson = await usageRes.json() } catch {}
    }

    if (subJson?.error) {
      return success(c, { ok: false, credit: 0, message: subJson.error.message || 'Failed to query subscription' })
    }

    const hardLimit = Number(subJson?.hard_limit_usd ?? subJson?.system_hard_limit_usd ?? 0)
    const totalUsage = Number(usageJson?.total_usage ?? 0) / 100 // convert cents to USD
    // If unlimited quota in New-API, hard_limit_usd is 100000000
    const remaining = hardLimit >= 100000000 ? hardLimit : Math.max(0, Number((hardLimit - totalUsage).toFixed(4)))

    return success(c, {
      ok: true,
      credit: remaining,
      hard_limit: hardLimit,
      total_usage: totalUsage,
      is_unlimited: hardLimit >= 100000000,
    })
  } catch (err: any) {
    return success(c, { ok: false, credit: 0, message: err.message || 'Error checking credit' })
  }
})

// POST /ai-configs/fetch-models — dynamically fetch model list from provider using API key
app.post('/fetch-models', async (c) => {
  const body = await c.req.json()
  let { provider, base_url, api_key, service_type, config_id } = body

  if (config_id) {
    const [existing] = await db.select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, Number(config_id)))
    if (existing) {
      provider = provider || existing.provider
      base_url = base_url || existing.baseUrl
      api_key = (!api_key || api_key === '********') ? existing.apiKey : api_key
      service_type = service_type || existing.serviceType
    }
  }

  if (!provider) return badRequest(c, 'provider 必填')
  if (!api_key) return badRequest(c, 'api_key 必填')

  const p = (provider || '').toLowerCase()
  const lang = getContentLanguage()

  if (p === 'gemini') {
    try {
      const url = new URL(joinProviderUrl(base_url || 'https://generativelanguage.googleapis.com', '/v1beta', '/models'))
      url.searchParams.set('key', api_key)
      const resp = await fetch(url.toString(), {
        method: 'GET',
        headers: geminiHeaders(api_key),
        signal: AbortSignal.timeout(15000),
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        let msg = ''
        if (resp.status === 401 || resp.status === 403) msg = lang === 'th' ? 'API Key ไม่ถูกต้อง หรือไม่มีสิทธิ์เข้าถึง' : 'API Key 无效或未授权'
        else if (resp.status === 429) msg = lang === 'th' ? 'เกินขีดจำกัดโควต้า (Rate Limit)' : '配额超限 (Rate Limit)'
        else msg = `${resp.status} ${resp.statusText}: ${text.slice(0, 120)}`
        return success(c, { ok: false, error: msg, models: [], text_models: [], image_models: [] })
      }
      const json: any = await resp.json()
      const rawModels = Array.isArray(json?.models) ? json.models : []
      const textModels: string[] = []
      const imageModels: string[] = []
      const videoModels: string[] = []
      const allModels: string[] = []

      for (const item of rawModels) {
        const name = (item.name || '').replace(/^models\//, '')
        if (!name) continue
        allModels.push(name)
        const methods: string[] = Array.isArray(item.supportedGenerationMethods) ? item.supportedGenerationMethods : []
        const isVideo = methods.some(m => /video/i.test(m)) || /veo/i.test(name)
        const isImage = (methods.some(m => /image/i.test(m)) || /imagen/i.test(name)) && !isVideo
        const isText = methods.includes('generateContent') && !/embedding/i.test(name) && !isImage && !isVideo

        if (isText) textModels.push(name)
        if (isImage) imageModels.push(name)
        if (isVideo) videoModels.push(name)
      }

      // Priority sort for Gemini models: newer flash / pro models first
      const priorityOrder = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash-8b']
      textModels.sort((a, b) => {
        const ia = priorityOrder.indexOf(a)
        const ib = priorityOrder.indexOf(b)
        if (ia !== -1 && ib !== -1) return ia - ib
        if (ia !== -1) return -1
        if (ib !== -1) return 1
        return a.localeCompare(b)
      })

      const finalImageModels = imageModels.length ? imageModels : ['imagen-3.0-generate-002', 'gemini-3-pro-image', 'imagen-3.0-fast-generate-001']
      const finalVideoModels = videoModels.length ? videoModels : ['veo-2.0-generate-001', 'veo-4s-360p', 'veo-8s-720p', 'veo']
      const finalTextModels = textModels.length ? textModels : ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']

      let selected = finalTextModels
      if (service_type === 'image') selected = finalImageModels
      else if (service_type === 'video') selected = finalVideoModels

      return success(c, {
        ok: true,
        provider: 'gemini',
        models: selected,
        text_models: finalTextModels,
        image_models: finalImageModels,
        video_models: finalVideoModels,
        count: selected.length,
      })
    } catch (err: any) {
      return success(c, { ok: false, error: err.message || 'Request failed', models: [], text_models: [], image_models: [], video_models: [] })
    }
  }

  if (p === 'openai' || p === 'antigravity') {
    try {
      const targetBase = base_url || (p === 'antigravity' ? 'http://127.0.0.1:8317' : 'https://api.openai.com')
      const url = joinProviderUrl(targetBase, '/v1', '/models')
      const resp = await fetch(url, {
        method: 'GET',
        headers: bearerHeaders(api_key || (p === 'antigravity' ? 'huobao-antigravity' : undefined)),
        signal: AbortSignal.timeout(15000),
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        let msg = ''
        if (resp.status === 401 || resp.status === 403) msg = lang === 'th' ? 'API Key ไม่ถูกต้อง หรือไม่มีสิทธิ์เข้าถึง' : 'API Key 无效或未授权'
        else if (resp.status === 429) msg = lang === 'th' ? 'เกินขีดจำกัดโควต้า (Rate Limit)' : '配额超限 (Rate Limit)'
        else msg = `${resp.status} ${resp.statusText}: ${text.slice(0, 120)}`
        return success(c, { ok: false, error: msg, models: [], text_models: [], image_models: [], video_models: [] })
      }
      const json: any = await resp.json()
      const list = Array.isArray(json?.data) ? json.data : (Array.isArray(json?.models) ? json.models : [])
      const allIds: string[] = list.map((m: any) => typeof m === 'string' ? m : m?.id).filter(Boolean)

      const imageModels = allIds.filter(id => /dall-e|image|flux|sd|stable-diffusion|midjourney|ideogram|recraft|imagen|gem_pix/i.test(id))
      const videoModels = allIds.filter(id => (/veo|sora|kling|runway|luma|cogvideox|hailuo|minimax|wan.*video|doubao-seedance|vidu|video/i.test(id)) && !imageModels.includes(id))
      const textModels = allIds.filter(id => !/^(text-embedding|embedding|whisper|tts|canary|babbage|davinci|audio)/i.test(id) && !imageModels.includes(id) && !videoModels.includes(id))

      // Text models sorting: flagship & chat models prioritized
      const topIds = ['qwen-plus', 'qwen3.8-max', 'qwen3.8-flash', 'gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini', 'deepseek-chat', 'deepseek-reasoner', 'claude-sonnet-5', 'claude-opus-5', 'gpt-6.1-sol', 'gpt-6-luna', 'claude-sonnet-4-6', 'gemini-3.8-flash-high', 'gemini-3.7-flash-high']
      textModels.sort((a, b) => {
        const ia = topIds.indexOf(a)
        const ib = topIds.indexOf(b)
        if (ia !== -1 && ib !== -1) return ia - ib
        if (ia !== -1) return -1
        if (ib !== -1) return 1
        return a.localeCompare(b)
      })

      // Strictly return models authorized for this token - no fake fallback injection
      const finalImageModels = imageModels
      const finalVideoModels = videoModels
      const finalTextModels = textModels

      let selected = finalTextModels
      if (service_type === 'image') selected = finalImageModels
      else if (service_type === 'video') selected = finalVideoModels

      let message = ''
      if (allIds.length > 0 && selected.length === 0) {
        if (service_type === 'image') {
          message = lang === 'th'
            ? `API Key นี้ไม่ได้รับอนุญาตให้ใช้โมเดลรูปภาพใดๆ (พบเฉพาะโมเดลข้อความ: ${allIds.slice(0, 4).join(', ')})`
            : `此 API Key 未授权任何图片模型（仅包含: ${allIds.slice(0, 4).join(', ')}）`
        } else if (service_type === 'video') {
          message = lang === 'th'
            ? `API Key นี้ไม่ได้รับอนุญาตให้ใช้โมเดลวิดีโอใดๆ (พบเฉพาะโมเดลข้อความ: ${allIds.slice(0, 4).join(', ')})`
            : `此 API Key 未授权任何视频模型（仅包含: ${allIds.slice(0, 4).join(', ')}）`
        }
      }

      return success(c, {
        ok: true,
        provider: p,
        models: selected,
        text_models: finalTextModels,
        image_models: finalImageModels,
        video_models: finalVideoModels,
        count: selected.length,
        message: message || undefined,
      })
    } catch (err: any) {
      return success(c, { ok: false, error: err.message || 'Request failed', models: [], text_models: [], image_models: [], video_models: [] })
    }
  }

  if (p === 'google_flow') {
    const textModels = ['gemini-3.8-flash-high', 'gemini-3.7-flash-high', 'gemini-2.5-flash']
    const imageModels = ['gem_pix_2', 'narwhal']
    const videoModels = ['veo-4s-360p', 'veo-8s-720p', 'veo']
    let selected = textModels
    if (service_type === 'image') selected = imageModels
    else if (service_type === 'video') selected = videoModels

    return success(c, {
      ok: true,
      provider: p,
      models: selected,
      text_models: textModels,
      image_models: imageModels,
      video_models: videoModels,
      count: selected.length,
    })
  }

  if (p === 'volcengine') {
    const textModels = ['doubao-pro-32k', 'doubao-lite-32k']
    const imageModels = ['doubao-seedream-3-0', 'doubao-seedream-1-0']
    const videoModels = ['doubao-seedance-2-0-mini-260615', 'doubao-seedance-2-0-fast-260128', 'doubao-seedance-2-0-260128']
    let selected = textModels
    if (service_type === 'image') selected = imageModels
    else if (service_type === 'video') selected = videoModels

    return success(c, {
      ok: true,
      provider: p,
      models: selected,
      text_models: textModels,
      image_models: imageModels,
      video_models: videoModels,
      count: selected.length,
    })
  }

  if (p === 'minimax') {
    const textModels = ['abab6.5s-chat', 'MiniMax-Text-01']
    const imageModels: string[] = []
    const videoModels = ['MiniMax-H3', 'video-01', 'video-01-live2d']
    let selected = textModels
    if (service_type === 'video') selected = videoModels

    return success(c, {
      ok: true,
      provider: p,
      models: selected,
      text_models: textModels,
      image_models: imageModels,
      video_models: videoModels,
      count: selected.length,
    })
  }

  if (p === 'aliyun') {
    const textModels = ['qwen-max', 'qwen-plus', 'qwen-turbo']
    const imageModels = ['wanx-v1', 'wanx-v2']
    const videoModels = ['wan3.0-video', 'wan3.0-video-prime', 'wan2.1-t2v-plus', 'wan2.1-i2v-plus']
    let selected = textModels
    if (service_type === 'image') selected = imageModels
    else if (service_type === 'video') selected = videoModels

    return success(c, {
      ok: true,
      provider: p,
      models: selected,
      text_models: textModels,
      image_models: imageModels,
      video_models: videoModels,
      count: selected.length,
    })
  }

  // Fallback for other providers
  return success(c, {
    ok: true,
    provider: p,
    models: [],
    text_models: [],
    image_models: [],
    video_models: [],
    message: lang === 'th' ? 'ผู้ให้บริการนี้ใช้โมเดลตามที่กำหนดไว้ล่วงหน้า' : '该服务商使用预设模型',
  })
})

// GET /ai-profiles — list all configured AI service profiles with masked keys
// Returns only metadata: no credentials, only provider info for UI selection
app.get('/profiles', async (c) => {
  const serviceType = c.req.query('service_type')
  let rows = await db.select().from(schema.aiServiceConfigs)
  if (serviceType) rows = rows.filter(r => r.serviceType === serviceType)

  // Only return configs for official providers (no custom/unknown)
  rows = rows.filter(r => isOfficialProvider(r.serviceType, r.provider))

  const profiles = rows.map(r => {
    const models = r.model ? JSON.parse(r.model) : []
    return {
      id: r.id,
      service_type: r.serviceType,
      provider: r.provider,
      name: r.name || `${r.provider}-${r.serviceType}`,
      base_url: r.baseUrl,
      model: models,
      model_default: models[0] || '',
      priority: r.priority || 0,
      is_active: Boolean(r.isActive),
      is_default: Boolean(r.isDefault),
      has_key: Boolean(r.apiKey),
      key_hint: r.apiKey ? '********' : '',
      created_at: r.createdAt,
      updated_at: r.updatedAt,
    }
  })

  return success(c, { profiles })
})

// GET /ai-configs/:id
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [row] = await db.select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, id))
  if (!row) return notFound(c)
  return success(c, withParsedFields(row))
})

// PUT /ai-configs/:id
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [existing] = await db.select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, id))
  if (!existing) return notFound(c)

  const serviceType = 'service_type' in body ? body.service_type : existing.serviceType
  const provider = 'provider' in body ? body.provider : existing.provider
  if (!isOfficialProvider(serviceType, provider)) {
    return badRequest(c, '不支持的 service_type/provider')
  }

  const updates: Record<string, any> = { updatedAt: now() }

  if ('service_type' in body) updates.serviceType = body.service_type
  if ('provider' in body) updates.provider = body.provider
  if ('name' in body) updates.name = body.name
  if ('base_url' in body) updates.baseUrl = body.base_url
  // Masked keys from GET responses are placeholders, not replacement values.
  // An empty or masked update keeps the existing secret so editing metadata does
  // not accidentally revoke a working provider configuration.
  if ('api_key' in body && body.api_key && body.api_key !== '********') updates.apiKey = body.api_key
  if ('model' in body) updates.model = JSON.stringify(body.model)
  if ('priority' in body) updates.priority = body.priority
  if ('is_active' in body) updates.isActive = body.is_active
  if ('is_default' in body) {
    const isDef = Boolean(body.is_default)
    updates.isDefault = isDef
    if (isDef) {
      await db.update(schema.aiServiceConfigs)
        .set({ isDefault: false, updatedAt: now() })
        .where(and(eq(schema.aiServiceConfigs.serviceType, serviceType), ne(schema.aiServiceConfigs.id, id)))
    }
  }
  if ('temperature' in body) {
    let temperature: number | null
    try {
      temperature = normalizeTemperature(body.temperature)
    } catch {
      return badRequest(c, 'temperature 须为 0 到 2 之间的数字')
    }
    // 与已有 settings 合并，清空的 temperature 从 JSON 中移除
    let settings: Record<string, any> = {}
    try { settings = existing.settings ? JSON.parse(existing.settings) : {} } catch { settings = {} }
    if (temperature === null) delete settings.temperature
    else settings.temperature = temperature
    updates.settings = Object.keys(settings).length ? JSON.stringify(settings) : null
  }

  await db.update(schema.aiServiceConfigs).set(updates).where(eq(schema.aiServiceConfigs.id, id))
  return success(c)
})

// DELETE /ai-configs/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await db.delete(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, id))
  return success(c)
})

// GET /ai-providers
export const aiProviders = new Hono()
aiProviders.get('/', async (c) => {
  const rows = await db.select().from(schema.aiServiceProviders)
  return success(c, rows.map(r => ({
    ...toSnakeCase(r),
    preset_models: r.presetModels ? JSON.parse(r.presetModels) : [],
  })))
})

export default app
