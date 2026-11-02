/**
 * 应用级全局设置（app_settings key-value 表）
 * AI 内容语言：所有 Agent 产出（剧本/提取/分镜/提示词）统一使用的目标语言
 * 层次约束：本模块只依赖 db，严禁反向 import agents/*（agents/context.ts 会引用本模块）
 *
 * 注意：刻意做成同步 API（better-sqlite3 驱动的 .get()/.run()），
 * 供 agents/context.ts 的同步 buildAgentRequestContext 内部直接调用
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'

export const CONTENT_LANGUAGES = ['th', 'zh', 'en', 'ja', 'ko'] as const
export type ContentLanguage = typeof CONTENT_LANGUAGES[number]

const CONTENT_LANGUAGE_KEY = 'content_language'

function isContentLanguage(v: unknown): v is ContentLanguage {
  return typeof v === 'string' && (CONTENT_LANGUAGES as readonly string[]).includes(v)
}

/** 读取全局内容语言；未设置或值非法时回退 'th' */
export function getContentLanguage(): ContentLanguage {
  const row = db.select().from(schema.appSettings)
    .where(eq(schema.appSettings.key, CONTENT_LANGUAGE_KEY))
    .get()
  return isContentLanguage(row?.value) ? row.value : 'th'
}

/** 写入全局内容语言（upsert） */
export function setContentLanguage(lang: ContentLanguage): ContentLanguage {
  if (!isContentLanguage(lang)) throw new Error(`Invalid content language: ${lang}`)
  db.insert(schema.appSettings)
    .values({ key: CONTENT_LANGUAGE_KEY, value: lang, updatedAt: now() })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value: lang, updatedAt: now() },
    })
    .run()
  return lang
}

const TOURS_SEEN_KEY = 'tours_seen'
const MAX_TOURS_SEEN = 64

function sanitizeTourIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return []
  return [...new Set(ids.filter(v => typeof v === 'string' && v.length > 0 && v.length <= 100))].slice(0, MAX_TOURS_SEEN)
}

/** 已看过的引导漫游 id 列表（JSON 数组存储）；桌面端端口随启动变化，localStorage 不可靠，故落库 */
export function getToursSeen(): string[] {
  const row = db.select().from(schema.appSettings)
    .where(eq(schema.appSettings.key, TOURS_SEEN_KEY))
    .get()
  try { return sanitizeTourIds(JSON.parse(row?.value || '[]')) } catch { return [] }
}

/** 写入已看过的引导漫游 id 列表（upsert） */
export function setToursSeen(ids: unknown): string[] {
  const clean = sanitizeTourIds(ids)
  const value = JSON.stringify(clean)
  db.insert(schema.appSettings)
    .values({ key: TOURS_SEEN_KEY, value, updatedAt: now() })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value, updatedAt: now() },
    })
    .run()
  return clean
}

export interface VastPricingConfig {
  markupPercent: number // ค่าเริ่มต้น 40 (%)
  usdToThbRate: number // อัตราแลกเปลี่ยน THB/USD เช่น 36.0
  minShotPriceThb: number // ราคาขั้นต่ำต่อช็อต 10s เช่น 1.50
  r2OveragePricePerGb: number // ค่าบริการ R2 ส่วนเกิน 5GB เช่น 5.00
}

const VAST_PRICING_KEY = 'vast_pricing_config'

export const DEFAULT_VAST_PRICING: VastPricingConfig = {
  markupPercent: 40,
  usdToThbRate: 36.0,
  minShotPriceThb: 1.5,
  r2OveragePricePerGb: 5.0,
}

/** ดึงการตั้งค่าราคาและมาร์กอัป Vast.ai ปัจจุบัน */
export function getVastPricingConfig(): VastPricingConfig {
  const row = db.select().from(schema.appSettings)
    .where(eq(schema.appSettings.key, VAST_PRICING_KEY))
    .get()
  if (!row?.value) return { ...DEFAULT_VAST_PRICING }
  try {
    const parsed = JSON.parse(row.value)
    return {
      markupPercent: typeof parsed.markupPercent === 'number' && parsed.markupPercent >= 0 ? parsed.markupPercent : DEFAULT_VAST_PRICING.markupPercent,
      usdToThbRate: typeof parsed.usdToThbRate === 'number' && parsed.usdToThbRate > 0 ? parsed.usdToThbRate : DEFAULT_VAST_PRICING.usdToThbRate,
      minShotPriceThb: typeof parsed.minShotPriceThb === 'number' && parsed.minShotPriceThb >= 0 ? parsed.minShotPriceThb : DEFAULT_VAST_PRICING.minShotPriceThb,
      r2OveragePricePerGb: typeof parsed.r2OveragePricePerGb === 'number' && parsed.r2OveragePricePerGb >= 0 ? parsed.r2OveragePricePerGb : DEFAULT_VAST_PRICING.r2OveragePricePerGb,
    }
  } catch {
    return { ...DEFAULT_VAST_PRICING }
  }
}

/** อัปเดตการตั้งค่าราคาและมาร์กอัป Vast.ai (หลังบ้าน) */
export function setVastPricingConfig(config: Partial<VastPricingConfig>): VastPricingConfig {
  const current = getVastPricingConfig()
  const updated: VastPricingConfig = {
    markupPercent: typeof config.markupPercent === 'number' && config.markupPercent >= 0 ? config.markupPercent : current.markupPercent,
    usdToThbRate: typeof config.usdToThbRate === 'number' && config.usdToThbRate > 0 ? config.usdToThbRate : current.usdToThbRate,
    minShotPriceThb: typeof config.minShotPriceThb === 'number' && config.minShotPriceThb >= 0 ? config.minShotPriceThb : current.minShotPriceThb,
    r2OveragePricePerGb: typeof config.r2OveragePricePerGb === 'number' && config.r2OveragePricePerGb >= 0 ? config.r2OveragePricePerGb : current.r2OveragePricePerGb,
  }
  const value = JSON.stringify(updated)
  db.insert(schema.appSettings)
    .values({ key: VAST_PRICING_KEY, value, updatedAt: now() })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value, updatedAt: now() },
    })
    .run()
  return updated
}
