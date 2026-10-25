export interface ToraConfig {
  id: number
  serviceType: string
  provider: string
  name: string
  baseUrl: string
  apiKey: string
  model: string
  priority: number
  isActive: boolean
  isDefault: boolean
  settings: string | null
  endpoint: string | null
  queryEndpoint: string | null
}

/** Gateway URLs are server-configured, never trusted from a remote account's metadata. */
export function normalizeToraConfigs(rows: unknown, apiKey: string, gateways: Record<string, string>): ToraConfig[] {
  if (!Array.isArray(rows)) throw new Error('Invalid ToraAPI configuration response')
  return rows.flatMap((row): ToraConfig[] => {
    if (!row || typeof row !== 'object') return []
    const pairs: Record<string, string[]> = { text: ['openai', 'gemini', 'volcengine'], image: ['openai', 'gemini', 'volcengine'], video: ['aliyun', 'volcengine', 'minimax'] }
    if (!pairs[row.service_type]?.includes(row.provider)) return []
    // Local proxies cannot be used on the hosted web application.
    let source: URL
    try { source = new URL(row.base_url) } catch { return [] }
    if (/^(localhost|127(?:\.[0-9]+){3}|\[?::1\]?)$/i.test(source.hostname)) return []
    const baseUrl = gateways[row.provider]
    if (!baseUrl) return []
    const target = new URL(baseUrl)
    if (target.protocol !== 'https:' || target.username || target.password || target.search || target.hash) throw new Error('Invalid ToraAPI gateway URL')
    if (!Number.isSafeInteger(row.id) || row.id <= 0 || !Array.isArray(row.model) || !row.model.every((m: unknown) => typeof m === 'string')) return []
    return [{
      id: row.id, serviceType: row.service_type, provider: row.provider,
      name: String(row.name || `${row.provider}-${row.service_type}`).replace(/Huobao|Firemux|火宝/gi, 'ToraAPI'),
      baseUrl: target.toString().replace(/\/$/, ''), apiKey, model: JSON.stringify(row.model),
      priority: Number.isFinite(row.priority) ? row.priority : 0,
      isActive: row.is_active === true, isDefault: row.is_default === true,
      settings: typeof row.settings === 'string' ? row.settings : null,
      endpoint: typeof row.endpoint === 'string' ? row.endpoint : null,
      queryEndpoint: typeof row.query_endpoint === 'string' ? row.query_endpoint : null,
    }]
  })
}

export function publicToraConfig(row: ToraConfig) {
  let temperature: number | null = null
  try { const value = JSON.parse(row.settings || '{}').temperature; if (typeof value === 'number' && Number.isFinite(value)) temperature = value } catch {}
  return {
    id: row.id, service_type: row.serviceType, provider: row.provider, name: row.name,
    base_url: row.baseUrl, model: JSON.parse(row.model), api_key: row.apiKey ? '********' : '',
    api_key_configured: Boolean(row.apiKey), priority: row.priority, is_active: row.isActive,
    is_default: row.isDefault, temperature,
  }
}
