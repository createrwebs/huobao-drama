import type { ToraConfig } from './tora-configs.js'

export interface ToraModel {
  id: string
  serviceType: 'text' | 'image' | 'video' | 'unknown'
  provider: 'openai' | 'gemini' | 'unknown'
  endpointTypes: string[]
  executable: boolean
  inferred: boolean
}

/** Only IDs returned by the key-authenticated catalog may enter runtime configs.
 * Pricing metadata supplies endpoint types, not additional authorized IDs.
 */
export function parseToraModelCatalog(response: unknown, metadata: unknown): ToraModel[] {
  const data = (response as any)?.data
  if (!Array.isArray(data)) throw new Error('Invalid ToraAPI model catalog response')
  const rows = Array.isArray((metadata as any)?.data) ? (metadata as any).data : []
  const prices = new Map<string, any>(rows.map((row: any) => [row.model_name, row]))
  const seen = new Set<string>()
  return data.flatMap((row: any): ToraModel[] => {
    if (!row || typeof row.id !== 'string' || !row.id || seen.has(row.id)) return []
    seen.add(row.id)
    const info = { ...(prices.get(row.id) || {}), ...row }
    const endpointTypes: string[] = Array.isArray(info.supported_endpoint_types) ? info.supported_endpoint_types.filter((v: unknown) => typeof v === 'string') : []
    const modality = String(info.type || info.model_type || info.output_modalities?.[0] || '').toLowerCase()
    const image = endpointTypes.some(e => /image-generation|images\/|images-/i.test(e)) || modality === 'image'
    const video = endpointTypes.some(e => /video/i.test(e)) || modality === 'video'
    let serviceType: ToraModel['serviceType'] = video ? 'video' : image ? 'image' : 'unknown'
    let inferred = false
    if (serviceType === 'unknown') {
      // Classification by a recognizable media family is displayed as inferred,
      // and does not establish support for a generation endpoint.
      if (/^(veo|wan\d|doubao-seedance|minimax-h|hailuo)|(?:^|[-/])video(?:[-/]|$)/i.test(row.id)) { serviceType = 'video'; inferred = true }
      else if (/gpt-image|imagen|(?:^|[-/])image(?:[-/]|$)|stable-diffusion|flux\./i.test(row.id)) { serviceType = 'image'; inferred = true }
      else if (endpointTypes.some(e => ['openai', 'anthropic', 'gemini', 'openai-response'].includes(e))) serviceType = 'text'
    }
    const provider: ToraModel['provider'] = serviceType === 'image'
      ? endpointTypes.includes('image-generation') ? 'openai' : endpointTypes.includes('gemini') ? 'gemini' : 'unknown'
      : serviceType === 'text'
        ? endpointTypes.includes('openai') ? 'openai' : endpointTypes.includes('gemini') ? 'gemini' : 'unknown'
        : 'unknown'
    return [{ id: row.id, serviceType, provider, endpointTypes, executable: !inferred && serviceType !== 'video' && provider !== 'unknown', inferred }]
  })
}

export function buildToraModelConfigs(catalog: ToraModel[], apiKey: string, baseUrl: string, previous: ToraConfig[]): ToraConfig[] {
  const groups: Array<[string, string, number]> = [['text', 'openai', 1000001], ['text', 'gemini', 1000002], ['image', 'openai', 1000003], ['image', 'gemini', 1000004]]
  return groups.flatMap(([serviceType, provider, id]): ToraConfig[] => {
    const available = catalog.filter(m => m.executable && m.serviceType === serviceType && m.provider === provider).map(m => m.id)
    if (!available.length) return []
    const old = previous.filter(c => c.serviceType === serviceType).sort((a, b) => b.priority - a.priority)
    const preferred = old.flatMap(c => JSON.parse(c.model) as string[]).filter(m => available.includes(m))
    const models = [...new Set([...preferred, ...available])]
    return [{ id, serviceType, provider, name: `ToraAPI ${serviceType === 'text' ? 'Chat' : 'Image'} · ${provider}`, baseUrl,
      apiKey, model: JSON.stringify(models), priority: provider === 'openai' ? 100 : 90,
      isActive: true, isDefault: provider === 'openai', settings: null, endpoint: null, queryEndpoint: null }]
  })
}

export function groupToraModels(catalog: ToraModel[]) {
  return {
    chat: catalog.filter(m => m.serviceType === 'text'),
    image: catalog.filter(m => m.serviceType === 'image'),
    vdo: catalog.filter(m => m.serviceType === 'video'),
    unknown: catalog.filter(m => m.serviceType === 'unknown'),
  }
}
