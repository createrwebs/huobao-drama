/**
 * AI 服务抽象层 — 从数据库配置中获取 provider 和 API key
 */
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { logTaskProgress, logTaskWarn } from '../utils/task-logger.js'
import { joinProviderUrl } from './adapters/url.js'
import { getContentLanguage } from './app-settings.js'
import { toraAuth, isToraWebMode } from './tora-auth.js'
import type { ToraConfig } from './tora-configs.js'

export type ServiceType = 'text' | 'image' | 'video'

export interface AIConfig {
  provider: string
  baseUrl: string
  apiKey: string
  model: string
  availableModels?: string[]
  /** 采样温度，null 表示不设置（跟随服务商默认）。存于 ai_service_configs.settings JSON */
  temperature?: number | null
}

/** 从 settings JSON 解析 temperature；非法值一律视为未设置 */
export function parseConfigTemperature(settingsRaw: string | null | undefined): number | null {
  if (!settingsRaw) return null
  try {
    const t = JSON.parse(settingsRaw)?.temperature
    return typeof t === 'number' && Number.isFinite(t) ? t : null
  } catch {
    return null
  }
}

export const officialProviders: Record<ServiceType, readonly string[]> = {
  text: ['openai', 'gemini', 'volcengine', 'antigravity'],
  image: ['openai', 'gemini', 'volcengine', 'google_flow'],
  video: ['openai', 'volcengine', 'minimax', 'aliyun', 'google_flow'],
}

export function isOfficialProvider(serviceType?: string | null, provider?: string | null): boolean {
  const providers = officialProviders[serviceType as ServiceType]
  return !!providers && providers.includes((provider || '').toLowerCase())
}

export function getTextProviderBaseUrl(config: AIConfig) {
  const provider = config.provider.toLowerCase()

  if (provider === 'openai' || provider === 'antigravity') {
    return joinProviderUrl(config.baseUrl || 'http://127.0.0.1:8317', '/v1', '')
  }

  if (provider === 'gemini') {
    return joinProviderUrl(config.baseUrl, '/v1beta', '')
  }

  if (provider === 'volcengine') {
    return joinProviderUrl(config.baseUrl, '/api/v3', '')
  }

  return config.baseUrl
}

// Agent 多步循环会逐步重复解析同一配置，相同配置只打一次日志避免刷屏
const lastLoggedActiveConfigKey = new Map<string, string>()
const lastLoggedConfigByIdKey = new Map<number, string>()

export function configMatchesServiceType(row: Pick<ToraConfig, 'serviceType'> | undefined, expectedServiceType?: ServiceType): boolean {
  return !expectedServiceType || row?.serviceType === expectedServiceType
}

export function findConfigByServiceType(rows: readonly ToraConfig[], id: number, expectedServiceType?: ServiceType): ToraConfig | undefined {
  const row = rows.find(candidate => candidate.id === id)
  return configMatchesServiceType(row, expectedServiceType) ? row : undefined
}

function toraRuntimeConfig(row: ToraConfig | undefined): AIConfig | null {
  if (!row || !row.isActive) return null
  return { provider: row.provider, baseUrl: row.baseUrl, apiKey: row.apiKey, model: JSON.parse(row.model)[0] || '', availableModels: JSON.parse(row.model), temperature: parseConfigTemperature(row.settings) }
}

function activeToraConfig(serviceType: ServiceType) {
  return toraAuth.currentConfigs()?.filter(r => r.serviceType === serviceType && r.isActive).sort((a, b) => b.priority - a.priority)[0]
}

export async function getActiveConfig(serviceType: ServiceType): Promise<AIConfig | null> {
  if (isToraWebMode()) return toraRuntimeConfig(activeToraConfig(serviceType))
  const rows = (await db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.serviceType, serviceType))
  )
    .filter(r => r.isActive && isOfficialProvider(serviceType, r.provider))
    .sort((a, b) => {
      if (Boolean(b.isDefault) !== Boolean(a.isDefault)) return (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0)
      return (b.priority || 0) - (a.priority || 0)
    })

  const active = rows[0]
  if (!active) {
    logTaskWarn('AIConfig', 'active-config-missing', { serviceType })
    return null
  }

  const models = active.model ? JSON.parse(active.model) : []
  const logKey = `${active.id}:${models[0] || ''}`
  if (lastLoggedActiveConfigKey.get(serviceType) !== logKey) {
    lastLoggedActiveConfigKey.set(serviceType, logKey)
    logTaskProgress('AIConfig', 'active-config-selected', {
      serviceType,
      configId: active.id,
      provider: active.provider,
      model: models[0] || '',
      priority: active.priority,
    })
  }
  return {
    provider: active.provider || '',
    baseUrl: active.baseUrl,
    apiKey: active.apiKey,
    model: models[0] || '',
    availableModels: models,
    temperature: parseConfigTemperature(active.settings),
  }
}

export async function getTextConfig(): Promise<AIConfig> {
  const config = await getActiveConfig('text')
  if (!config) {
    const lang = getContentLanguage()
    const msg = lang === 'th'
      ? 'ยังไม่ได้ตั้งค่าโมเดลข้อความ (Text AI) กรุณาไปที่หน้า «ตั้งค่า» เพื่อเพิ่มและเปิดใช้งานบริการ AI (เช่น Gemini หรือ OpenAI)'
      : (lang === 'en'
        ? 'Text model not configured. Please go to Settings to add and enable an AI service (e.g. Gemini or OpenAI).'
        : '未配置文本模型，请先到「设置」页添加并启用 AI 服务')
    throw new Error(msg)
  }
  return config
}

/**
 * 取某服务类型当前启用且优先级最高的官方配置 ID（创建集时自动锁定用）
 */
export async function getActiveConfigId(serviceType: ServiceType): Promise<number | null> {
  if (isToraWebMode()) return activeToraConfig(serviceType)?.id ?? null
  const rows = (await db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.serviceType, serviceType))
  )
    .filter(r => r.isActive && isOfficialProvider(serviceType, r.provider))
    .sort((a, b) => {
      if (Boolean(b.isDefault) !== Boolean(a.isDefault)) return (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0)
      return (b.priority || 0) - (a.priority || 0)
    })
  return rows[0]?.id ?? null
}

export async function getConfigById(id: number, expectedServiceType?: ServiceType): Promise<AIConfig | null> {
  if (isToraWebMode()) {
    const row = findConfigByServiceType(toraAuth.currentConfigs() || [], id, expectedServiceType)
    return toraRuntimeConfig(row)
  }
  const [row] = await db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.id, id))
  if (!row || !row.isActive) {
    logTaskWarn('AIConfig', 'config-by-id-missing', { configId: id })
    return null
  }
  if (expectedServiceType && row.serviceType !== expectedServiceType) {
    logTaskWarn('AIConfig', 'config-by-id-wrong-service-type', { configId: id, expectedServiceType, actualServiceType: row.serviceType })
    return null
  }
  if (!isOfficialProvider(row.serviceType as ServiceType, row.provider)) {
    logTaskWarn('AIConfig', 'config-by-id-unsupported-provider', {
      configId: id,
      serviceType: row.serviceType,
      provider: row.provider,
    })
    return null
  }
  const models = row.model ? JSON.parse(row.model) : []
  const logKey = `${row.provider}:${models[0] || ''}:${row.serviceType}`
  if (lastLoggedConfigByIdKey.get(id) !== logKey) {
    lastLoggedConfigByIdKey.set(id, logKey)
    logTaskProgress('AIConfig', 'config-by-id-selected', {
      configId: id,
      provider: row.provider,
      model: models[0] || '',
      serviceType: row.serviceType,
    })
  }
  return {
    provider: row.provider || '',
    baseUrl: row.baseUrl,
    apiKey: row.apiKey,
    model: models[0] || '',
    availableModels: models,
    temperature: parseConfigTemperature(row.settings),
  }
}
