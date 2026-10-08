/**
 * 批量视频提示词任务 — 异步为缺少 video_prompt 的分镜逐个运行 prompt_generator Agent
 * 进程内内存态：按集跟踪一份任务，运行中不重复启动；重启后状态丢失
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { mastra } from '../mastra/index.js'
import { buildAgentRequestContext } from '../agents/context.js'
import { getContentLanguage } from './app-settings.js'
import { logTaskError, logTaskProgress, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

export interface VideoPromptBatchStatus {
  status: 'running' | 'done' | 'error'
  total: number
  completed: number
  failed: number
  current_storyboard_id?: number
  started_at: string
  finished_at?: string
  error?: string
}

const tasks = new Map<number, VideoPromptBatchStatus>()

/** 启动批量生成（立即返回）；运行中返回 started:false,total:-1；无待生成分镜返回 started:false,total:0；
 *  传入 storyboardIds 时只处理所选分镜（即使已有提示词也重新生成），否则处理全部缺失提示词的分镜 */
export async function startVideoPromptBatch(
  episodeId: number,
  dramaId: number,
  opts: { model?: string; configId?: number } = {},
  storyboardIds?: number[],
): Promise<{ started: boolean; total: number }> {
  if (tasks.get(episodeId)?.status === 'running') return { started: false, total: -1 }

  const sbs = await db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(schema.storyboards.storyboardNumber)
  const pending = storyboardIds?.length
    ? sbs.filter(sb => storyboardIds.includes(sb.id))
    : sbs.filter(sb => !(sb.videoPrompt || '').trim())
  if (!pending.length) return { started: false, total: 0 }

  // 视频模型标签：跟随该集锁定的视频配置，供 Agent 按模型特性生成
  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId))
  let videoLabel = '默认'
  if (ep?.videoConfigId) {
    const [cfg] = await db.select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, ep.videoConfigId))
    if (cfg) videoLabel = `${cfg.name} (${cfg.provider})`
  }

  const task: VideoPromptBatchStatus = {
    status: 'running',
    total: pending.length,
    completed: 0,
    failed: 0,
    started_at: new Date().toISOString(),
  }
  tasks.set(episodeId, task)

  logTaskStart('VideoPrompt', 'batch', { episodeId, dramaId, total: pending.length, model: opts.model || undefined })
  ;(async () => {
    const agent = mastra.getAgent('prompt_generator')
    if (!agent) throw new Error('视频提示词 Agent 不可用')
    const requestContext = buildAgentRequestContext({
      episodeId,
      dramaId,
      modelOverride: opts.model || undefined,
      textConfigId: opts.configId || undefined,
    })

    for (const sb of pending) {
      task.current_storyboard_id = sb.id
      logTaskProgress('VideoPrompt', 'batch-shot', { episodeId, storyboardId: sb.id, index: task.completed + task.failed + 1, total: task.total })
      try {
        const lang = getContentLanguage()
        const promptContent = lang === 'th'
          ? `โปรดสร้างพร้อมท์วิดีโอ (video_prompt) สำหรับสตอรี่บอร์ด #${sb.storyboardNumber}(ID:${sb.id}) โมเดลวิดีโอ:${videoLabel}
โปรดเรียกใช้ read_storyboard_context ก่อนเพื่อรับคำอธิบายภาพ (รวมถึงช็อตย่อย 【ช็อต N】 และบทพูด/เสียงบรรยาย), บรรยากาศ, รายชื่อตัวละคร และข้อมูลฉาก (lighting, prompt)
จากนั้นสร้าง video_prompt:
1. บรรทัดแรกต้องเป็นส่วนหัว (Header): ระบุเพียงรายชื่อตัวละครที่เข้าฉากด้วย @ชื่อตัวละคร และบริบทของฉาก เช่น "ตัวละคร: @ชื่อตัวละคร1, @ชื่อตัวละคร2; ฉาก: @ชื่อฉาก (สภาพแวดล้อม แสงและบรรยากาศ)."
   - กฎสำคัญ: ห้ามคัดลอกรูปลักษณ์หรือชุดเริ่มต้น (appearance, styling) จากไฟล์โปรไฟล์ตัวละครมาใส่ในวงเล็บเด็ดขาด เพราะระบบส่งรูปอ้างอิงตัวละคร (Reference) ไปให้โมเดลแล้ว และในฉากใหม่ตัวละครอาจเปลี่ยนอิริยาบถ บาดเจ็บ เสื้อขาด หรือเปลี่ยนชุดตามเนื้อเรื่อง การระบุชุดหรือท่าทางจากโปรไฟล์เริ่มต้นจะทำให้ภาพขัดแย้งกับฉากจริง
2. จากนั้นแบ่งช่วงละ 3 วินาที แยกบรรทัด ดึงเฉพาะการกระทำ อิริยาบถ สีหน้า สภาพของตัวละครในฉากนั้นๆ และบทพูดจาก 【ช็อต N】 ใช้ @ชื่อตัวละคร และ @ชื่อฉาก ให้ตรงกัน อนุญาตให้ตัดช็อตภายในช่วงได้แต่ไม่ข้ามฉาก
แล้วเรียกใช้ update_storyboard เพื่อบันทึกลงในสตอรี่บอร์ด ID:${sb.id} ส่งเฉพาะพารามิเตอร์ storyboard_id และ video_prompt เท่านั้น อย่าส่งฟิลด์อื่นกลับมา`
          : `请为分镜 #${sb.storyboardNumber}(ID:${sb.id})生成视频提示词(video_prompt)。视频模型:${videoLabel}。
请先调用 read_storyboard_context 获取该分镜的画面描述(含【镜头N】子镜头与台词/旁白)、氛围及时长，以及角色列表与场景信息(lighting, prompt)。
据此生成 video_prompt：
1. 第一行必须是信息头：仅列出出场人物 @角色名 与场景环境，格式如："出场人物：@角色名1, @角色名2；场景：@场景名 (地理环境、时代建筑、光照色调与氛围)。"
   - 重要规则：由于已传递角色参考图(Reference)，严禁照抄角色档案中的初始 appearance 或 styling（角色在新场景中可能受伤、衣衫破损、换装或姿态变化，照抄初始档案会导致画面冲突）；仅在子镜头中描述当前场景下的真实状态与动作；
2. 之后按 3 秒分段换行，写明机位景别、当前动作状态、对白与情绪，提到人物场景使用 @角色名/@场景名，段落内允许切镜但不跨场景，切镜点对齐【镜头N】结构。
然后调用 update_storyboard 保存到分镜 ID:${sb.id}。update_storyboard 参数只传 storyboard_id 和 video_prompt 两个键，不要回传该分镜的其他任何字段。`
        await agent.generate([{
          role: 'user',
          content: promptContent,
        }], { maxSteps: 8, requestContext })
        // 以实际落库为准判定成败
        const [fresh] = await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, sb.id))
        if ((fresh?.videoPrompt || '').trim()) task.completed++
        else {
          task.failed++
          logTaskError('VideoPrompt', 'batch-shot', { storyboardId: sb.id, error: 'agent finished but video_prompt is empty' })
        }
      } catch (err: any) {
        task.failed++
        logTaskError('VideoPrompt', 'batch-shot', { storyboardId: sb.id, error: err?.message })
      }
    }
  })()
    .then(() => {
      task.status = 'done'
      task.finished_at = new Date().toISOString()
      task.current_storyboard_id = undefined
      logTaskSuccess('VideoPrompt', 'batch', { episodeId, total: task.total, completed: task.completed, failed: task.failed })
    })
    .catch((err: any) => {
      task.status = 'error'
      task.finished_at = new Date().toISOString()
      task.error = err?.message || '批量生成失败'
      logTaskError('VideoPrompt', 'batch', { episodeId, error: err?.message })
    })
  return { started: true, total: pending.length }
}

export function getVideoPromptBatchStatus(episodeId: number): VideoPromptBatchStatus | null {
  return tasks.get(episodeId) || null
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * เติมบริบทของฉาก (prompt, lighting) และสไตล์ภาพรวมของเรื่อง (drama style) ลงใน video_prompt
 * หากตัวละครมีภาพอ้างอิง (Reference Image) หรือส่ง Reference ไปแล้ว จะไม่ดึง appearance/styling
 * จากไฟล์ตัวละครมาใส่ซ้ำ เพื่อป้องกันการขัดแย้งกับอิริยาบถหรือสภาพร่างกาย/ชุดในฉากใหม่ (เช่น บาดเจ็บ เสื้อขาด เปลี่ยนชุด)
 */
export async function enrichStoryboardVideoPrompt(
  rawPrompt: string,
  storyboardId?: number | null,
  options: { skipCharacterProfile?: boolean } = {},
): Promise<string> {
  let prompt = (rawPrompt || '')
    .replace(/^Shot on iPhone 16 Pro Max[\s\S]*?--no\s+cgi,\s*3d render,\s*cartoon[,\s]*/i, '')
    .replace(/\bempty scene,?\s*no people\b[,\s]*/gi, '')
    .replace(/--no\s+[^\n.;,]+(?:,\s*[^\n.;,]+)*/gi, '')
    .trim()
  if (!storyboardId || !prompt) return prompt

  try {
    const { getAllKnownStylePrompts, stripStylePrefix } = await import('./style-preset.js')
    prompt = stripStylePrefix(prompt, await getAllKnownStylePrompts())

    const [sb] = await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboardId))
    if (!sb) return prompt

    // 1. Get episode & drama style
    const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId))
    let dramaStyleName = ''
    if (ep?.dramaId) {
      const [drama] = await db.select().from(schema.dramas).where(eq(schema.dramas.id, ep.dramaId))
      if (drama?.style) {
        const [preset] = await db.select().from(schema.stylePresets)
          .where(eq(schema.stylePresets.value, drama.style))
        dramaStyleName = preset?.name || drama.style
      }
    }

    // 2. Get bound characters (including imageUrl to know if character reference image exists)
    const boundChars = await db.select({
      name: schema.characters.name,
      appearance: schema.characters.appearance,
      styling: schema.characters.styling,
      description: schema.characters.description,
      role: schema.characters.role,
      imageUrl: schema.characters.imageUrl,
    }).from(schema.storyboardCharacters)
      .innerJoin(schema.characters, eq(schema.storyboardCharacters.characterId, schema.characters.id))
      .where(eq(schema.storyboardCharacters.storyboardId, storyboardId))

    // 3. Get bound scene
    let sceneInfo: { location?: string; lighting?: string; prompt?: string } | null = null
    if (sb.sceneId) {
      const [sc] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, sb.sceneId))
      if (sc) {
        sceneInfo = {
          location: sc.location,
          lighting: sc.lighting || undefined,
          prompt: sc.prompt || undefined,
        }
      }
    }

    // If any character has a reference image (or skipCharacterProfile is set), strip static (@Name (...))
    // descriptions from the header line so old character-file descriptions don't conflict with the new scene.
    const lines = prompt.split('\n')
    for (let i = 0; i < Math.min(lines.length, 3); i++) {
      if (/^(?:\[สไตล์ภาพ:[^\]]*\]\s*)?(?:ตัวละคร|出场人物|Characters)\s*:/i.test(lines[i])) {
        const semiIdx = lines[i].indexOf(';')
        const fullSemiIdx = lines[i].indexOf('；')
        const splitAt = semiIdx >= 0 ? semiIdx : fullSemiIdx
        let charPart = splitAt >= 0 ? lines[i].slice(0, splitAt) : lines[i]
        const restPart = splitAt >= 0 ? lines[i].slice(splitAt) : ''
        for (const c of boundChars) {
          const hasRef = Boolean(options.skipCharacterProfile || c.imageUrl?.trim())
          if (hasRef && c.name) {
            const re = new RegExp(`@${escapeRegExp(c.name)}\\s*\\([^)]*\\)`, 'g')
            charPart = charPart.replace(re, `@${c.name}`)
          }
        }
        lines[i] = charPart + restPart
      }
    }
    prompt = lines.join('\n')

    // Format character context descriptions:
    // Only include character file appearance/styling if the character has NO reference image AND skipCharacterProfile is false
    const charContexts: string[] = []
    for (const c of boundChars) {
      const hasRef = Boolean(options.skipCharacterProfile || c.imageUrl?.trim())
      if (hasRef) {
        charContexts.push(`@${c.name}`)
        continue
      }
      const traits: string[] = []
      if (c.appearance?.trim()) traits.push(c.appearance.trim())
      if (c.styling?.trim()) traits.push(c.styling.trim())
      if (!traits.length && c.description?.trim()) traits.push(c.description.trim())
      const desc = traits.filter(Boolean).join(', ')
      if (desc) {
        charContexts.push(`@${c.name} (${desc})`)
      } else {
        charContexts.push(`@${c.name}`)
      }
    }

    // Format scene context description (strip empty-scene phrases used only for background plates)
    let sceneContext = ''
    if (sceneInfo?.location) {
      const sceneTraits: string[] = []
      if (sceneInfo.lighting?.trim()) sceneTraits.push(sceneInfo.lighting.trim())
      if (sceneInfo.prompt?.trim()) {
        const cleanedScenePrompt = sceneInfo.prompt
          .replace(/(?:ปราศจากผู้คนในฉาก|ไม่มีผู้คนในฉาก|ปราศจากผู้คน|empty scene,?\s*no people|no people,?\s*zero human presence)/gi, '')
          .replace(/[,\s]+$/, '')
          .trim()
        if (cleanedScenePrompt) sceneTraits.push(cleanedScenePrompt)
      }
      const desc = sceneTraits.filter(Boolean).join(', ')
      sceneContext = desc ? `@${sceneInfo.location} (${desc})` : `@${sceneInfo.location}`
    }

    // Check if prompt already has a header line (e.g. starts with ตัวละคร: / 出场人物: / Characters:)
    const hasHeaderLine = /^(?:\[สไตล์ภาพ:[^\]]*\]\s*\n?)?(?:ตัวละคร|出场人物|Characters)\s*:/i.test(prompt)
    if (hasHeaderLine) {
      if (dramaStyleName && !prompt.includes('สไตล์ภาพ') && !prompt.includes('Style:')) {
        return `[สไตล์ภาพ: ${dramaStyleName}]\n${prompt}`
      }
      return prompt
    }

    // Build header
    const headerParts: string[] = []
    if (dramaStyleName) headerParts.push(`สไตล์ภาพ: ${dramaStyleName}`)
    if (charContexts.length > 0) headerParts.push(`ตัวละคร: ${charContexts.join(', ')}`)
    if (sceneContext) headerParts.push(`ฉาก: ${sceneContext}`)

    if (!headerParts.length) return prompt

    const newHeader = headerParts.join('; ') + '.\n'
    return `${newHeader}${prompt}`
  } catch (err) {
    console.warn('[VideoPrompts] Failed to enrich video prompt:', err)
    return prompt
  }
}

