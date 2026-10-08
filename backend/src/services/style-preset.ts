/**
 * 风格预设服务 — 将项目绑定的视觉风格解析为英文提示词片段
 * dramas.style 存 style_presets.value；查不到/已停用时返回空串（调用方走兜底）
 */
import { and, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'

/** 查询项目绑定的风格预设英文提示词片段；查不到返回 '' */
export async function getDramaStylePrompt(dramaId: number | null | undefined): Promise<string> {
  if (!dramaId) return ''
  const [drama] = await db.select().from(schema.dramas).where(eq(schema.dramas.id, dramaId))
  if (!drama?.style) return ''
  const [preset] = await db.select().from(schema.stylePresets)
    .where(and(eq(schema.stylePresets.value, drama.style), eq(schema.stylePresets.isActive, true)))
  return preset?.prompt || ''
}

/** 获取所有已知预设的 prompt 列表（用于剥离旧风格前缀） */
const HISTORICAL_STYLE_PROMPTS = [
  'Shot on iPhone 16 Pro Max, premium cinematic still, clean shadow detail, wide-angle establishing shot, interior of an ancient rural Thai bamboo hut at midnight, three-layer composition: foreground packed dirt floor and clay bowls; midground bamboo platform bed with woven reed mat, stone mortar, pestle, dried herbs, and a flickering antique oil lamp casting warm amber glow on bamboo textures and floating dust motes; background dark bamboo woven walls and thatched roof rafters, cool dark shadows contrasting with warm lamp light, tense silent atmosphere, empty scene, no people --no cgi, 3d render, cartoon',
  'Ultra-realistic cinematic beauty portrait, golden hour natural sunlight with soft rim light illuminating hair, dreamy luxury lifestyle aesthetic, shallow depth of field, soft natural skin texture with satin finish, subtle film grain, captured on iPhone 16 Pro Max, flawless hydrated glass skin, bright expressive eyes, voluminous hair with glossy healthy shine, photorealistic 8K, crisp elegant details, effortlessly stunning, avoid 3D CGI render, avoid cartoon or anime, avoid plastic waxy doll skin, avoid airbrushed smoothing filter',
  'ultra-realistic cinematic 35mm film photography, shot on ARRI Alexa LF with Panavision anamorphic lens, authentic skin micro-texture with visible natural pores and subtle imperfections, lifelike eye reflections and depth, real fabric weave, cinematic three-point lighting, soft key light, gentle rim light, atmospheric volumetric haze, natural shadows, Kodak Vision3 500T color grading, shallow depth of field, creamy optical bokeh, subtle organic film grain, masterful film still, avoid 3D CGI render, avoid anime or cartoon, avoid plastic waxy skin, avoid airbrushed smoothing filter, avoid doll face, avoid flat harsh lighting',
  'ultra-realistic cinematic live-action look, professional film photography, natural skin tones with detailed pores and realistic texture, true human anatomy and proportions, shallow depth of field with creamy bokeh, cinematic three-point lighting, subtle film grain, 35mm lens cinematic framing, true-to-life color grading, detailed real-world environments, consistent actor appearance across shots, avoid cartoon or anime features, avoid 3D render look, avoid illustration style, avoid plastic waxy skin, avoid over-smoothing beauty filter',
]

/** 获取所有已知预设的 prompt 列表（用于剥离旧风格前缀） */
export async function getAllKnownStylePrompts(): Promise<string[]> {
  const presets = await db.select().from(schema.stylePresets)
  const prompts = presets.map(p => p.prompt).filter(Boolean)
  return Array.from(new Set([...prompts, ...HISTORICAL_STYLE_PROMPTS]))
}

/** 剥离提示词前方的旧风格前缀（若有，循环剥离直到完全清理） */
export function stripStylePrefix(prompt: string, knownStylePrompts: string[]): string {
  let cleaned = prompt.trim()
  const sorted = [...knownStylePrompts].filter(Boolean).map(s => s.trim()).sort((a, b) => b.length - a.length)
  let changed = true
  while (changed) {
    changed = false
    for (const sp of sorted) {
      if (cleaned.startsWith(sp)) {
        cleaned = cleaned.slice(sp.length).replace(/^[,，\s\n]+/, '').trim()
        changed = true
        break
      }
    }
  }
  return cleaned
}

/** 确保提示词使用该剧本当前绑定的风格前缀 */
export async function applyDramaStyleToPrompt(prompt: string, dramaId: number | null | undefined): Promise<string> {
  if (!prompt || !dramaId) return prompt
  const stylePrompt = await getDramaStylePrompt(dramaId)
  if (!stylePrompt) return prompt

  const allPrompts = await getAllKnownStylePrompts()
  const content = stripStylePrefix(prompt, allPrompts)
  return content ? `${stylePrompt}, ${content}` : stylePrompt
}

/** 当剧本切换风格时，批量同步该剧本下已有资产（角色/场景/道具）的 finalPrompt 风格前缀 */
export async function syncDramaAssetStylePrompts(dramaId: number, targetStyle?: string): Promise<void> {
  let stylePrompt = ''
  if (targetStyle) {
    const [preset] = await db.select().from(schema.stylePresets)
      .where(and(eq(schema.stylePresets.value, targetStyle), eq(schema.stylePresets.isActive, true)))
    stylePrompt = preset?.prompt || ''
  } else {
    stylePrompt = await getDramaStylePrompt(dramaId)
  }

  const allPrompts = await getAllKnownStylePrompts()
  const ts = now()

  // 1. 同步角色
  const chars = await db.select().from(schema.characters).where(eq(schema.characters.dramaId, dramaId))
  for (const c of chars) {
    if (!c.finalPrompt) continue
    const core = stripStylePrefix(c.finalPrompt, allPrompts)
    const newPrompt = stylePrompt ? (core ? `${stylePrompt}, ${core}` : stylePrompt) : core
    if (newPrompt !== c.finalPrompt) {
      await db.update(schema.characters).set({ finalPrompt: newPrompt, updatedAt: ts }).where(eq(schema.characters.id, c.id))
    }
  }

  // 2. 同步场景
  const scenes = await db.select().from(schema.scenes).where(eq(schema.scenes.dramaId, dramaId))
  for (const s of scenes) {
    if (!s.finalPrompt) continue
    const core = stripStylePrefix(s.finalPrompt, allPrompts)
    const newPrompt = stylePrompt ? (core ? `${stylePrompt}, ${core}` : stylePrompt) : core
    if (newPrompt !== s.finalPrompt) {
      await db.update(schema.scenes).set({ finalPrompt: newPrompt, updatedAt: ts }).where(eq(schema.scenes.id, s.id))
    }
  }

  // 3. 同步道具
  const props = await db.select().from(schema.props).where(eq(schema.props.dramaId, dramaId))
  for (const p of props) {
    if (!p.finalPrompt) continue
    const core = stripStylePrefix(p.finalPrompt, allPrompts)
    const newPrompt = stylePrompt ? (core ? `${stylePrompt}, ${core}` : stylePrompt) : core
    if (newPrompt !== p.finalPrompt) {
      await db.update(schema.props).set({ finalPrompt: newPrompt, updatedAt: ts }).where(eq(schema.props.id, p.id))
    }
  }
}

