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
โปรดเรียกใช้ read_storyboard_context ก่อนเพื่อรับคำอธิบายภาพ (รวมถึงช็อตย่อย 【ช็อต N】 และบทพูด/เสียงบรรยาย), บรรยากาศ, ข้อมูลตัวละคร (appearance, styling) และข้อมูลฉาก (lighting, prompt)
จากนั้นสร้าง video_prompt:
1. บรรทัดแรกต้องเป็นส่วนหัว (Header): ระบุบริบทภาพ รูปลักษณ์ และเครื่องแต่งกายของตัวละครและฉากอย่างละเอียด เช่น "ตัวละคร: @ชื่อตัวละคร (เพศ วัย รูปร่างหน้าตา ทรงผม สีผิว เสื้อผ้าเครื่องแต่งกายที่ใส่), ...; ฉาก: @ชื่อฉาก (สภาพแวดล้อม ยุคสมัย แสงและบรรยากาศ)." เพื่อให้โมเดลวิดีโอเข้าใจตัวละครได้อย่างถูกต้อง
2. จากนั้นแบ่งช่วงละ 3 วินาที แยกบรรทัด ดึงการกระทำ สีหน้า บทพูดจาก 【ช็อต N】 ใช้ @ชื่อตัวละคร และ @ชื่อฉาก ให้ตรงกัน อนุญาตให้ตัดช็อตภายในช่วงได้แต่ไม่ข้ามฉาก
แล้วเรียกใช้ update_storyboard เพื่อบันทึกลงในสตอรี่บอร์ด ID:${sb.id} ส่งเฉพาะพารามิเตอร์ storyboard_id และ video_prompt เท่านั้น อย่าส่งฟิลด์อื่นกลับมา`
          : `请为分镜 #${sb.storyboardNumber}(ID:${sb.id})生成视频提示词(video_prompt)。视频模型:${videoLabel}。
请先调用 read_storyboard_context 获取该分镜的画面描述(含【镜头N】子镜头与台词/旁白)、氛围及时长，以及角色外貌装束(appearance, styling)与场景信息(lighting, prompt)。
据此生成 video_prompt：
1. 第一行必须是信息头：详细注明出场人物的外貌、体貌、发型、肤色与服装装束，以及场景的环境时代与光线，格式如："出场人物：@角色名 (性别、年龄、体貌特征与发型肤色、服装装束)，...；场景：@场景名 (地理环境、时代建筑、光照色调与氛围)。" 确保视频模型获得完整人物视觉上下文；
2. 之后按 3 秒分段换行，写明机位景别、动作、对白与情绪，提到人物场景使用 @角色名/@场景名，段落内允许切镜但不跨场景，切镜点对齐【镜头N】结构。
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

/**
 * เติมบริบทภาพของตัวละคร (appearance, styling) และฉาก (prompt, lighting)
 * รวมถึงสไตล์ภาพรวมของเรื่อง (drama style) ลงใน video_prompt ก่อนส่งเข้า AI Video Engine (เช่น Google Flow / Veo)
 * เพื่อให้โมเดลเข้าใจว่าตัวละครและฉากมีรูปลักษณ์อย่างไร ไม่สร้างมั่วหรือหน้าตาเพี้ยน
 */
export async function enrichStoryboardVideoPrompt(
  rawPrompt: string,
  storyboardId?: number | null
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

    // 2. Get bound characters with appearance and styling
    const boundChars = await db.select({
      name: schema.characters.name,
      appearance: schema.characters.appearance,
      styling: schema.characters.styling,
      description: schema.characters.description,
      role: schema.characters.role,
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

    // Format character context descriptions
    const charContexts: string[] = []
    for (const c of boundChars) {
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

    // Check if prompt already has detailed character context (e.g. contains @Name (...))
    const hasDetailedCharContext = boundChars.some(c =>
      prompt.includes(`@${c.name} (`) || prompt.includes(`@${c.name}(`)
    )

    if (hasDetailedCharContext) {
      // Already has context, just ensure drama style prefix if not present
      if (dramaStyleName && !prompt.includes('สไตล์ภาพ') && !prompt.includes('Style:')) {
        return `[สไตล์ภาพ: ${dramaStyleName}]\n${prompt}`
      }
      return prompt
    }

    // Build rich header
    const headerParts: string[] = []
    if (dramaStyleName) headerParts.push(`สไตล์ภาพ: ${dramaStyleName}`)
    if (charContexts.length > 0) headerParts.push(`ตัวละคร: ${charContexts.join(', ')}`)
    if (sceneContext) headerParts.push(`ฉาก: ${sceneContext}`)

    if (!headerParts.length) return prompt

    const newHeader = headerParts.join('; ') + '.\n'

    // Replace existing bare header if present: e.g. "ตัวละคร: @ทิน, @จัน; ฉาก: @... .\n" or "出场人物：@...；场景：@...。\n"
    const bareHeaderRegex = /^(?:ตัวละคร|出场人物|Characters):\s*@[^;.\n]+(?:[,、]\s*@[^;.\n]+)*\s*;\s*(?:ฉาก|场景|Scene):\s*@[^.\n]+[.\n]+/i
    if (bareHeaderRegex.test(prompt)) {
      return prompt.replace(bareHeaderRegex, newHeader)
    }

    return `${newHeader}${prompt}`
  } catch (err) {
    console.warn('[VideoPrompts] Failed to enrich video prompt:', err)
    return prompt
  }
}

