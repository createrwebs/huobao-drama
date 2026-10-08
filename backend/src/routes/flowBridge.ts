import fs from 'fs'
import path from 'path'
import { Hono } from 'hono'
import { videoFileResponse } from '../utils/video-file-response.js'
import {
  getFlowEngineStatus,
  generateFlowImage,
  generateFlowVideo,
  listFlowAccounts,
  switchFlowAccount,
  importFlowAccount,
  deleteFlowAccount,
  listRecentFlowVideos,
  copyFlowVideoToStorage,
  resolveFlowEngine,
} from '../services/flow-engine.js'
import {
  getDramaCharacterRefs,
  syncDramaCharacterRefsToFlow,
} from '../services/flow-character-ref.js'
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { now } from '../utils/response.js'

export const flowBridge = new Hono()

// GET /status — ตรวจสอบสถานะการเชื่อมต่อ Google Flow
flowBridge.get('/status', async (c) => {
  try {
    const refresh = c.req.query('refresh') === '1' || c.req.query('refresh') === 'true'
    const status = await getFlowEngineStatus(refresh)
    return c.json({
      code: 0,
      data: status,
      msg: status.available ? 'Google Flow Engine พร้อมใช้งาน' : 'Google Flow Engine ยังไม่พร้อมใช้งาน',
    })
  } catch (err: any) {
    return c.json({ code: 500, msg: err.message || 'Error checking Flow engine status' }, 500)
  }
})

// GET /accounts — รายการบัญชี Google Flow ทั้งหมด
flowBridge.get('/accounts', async (c) => {
  try {
    const accounts = listFlowAccounts()
    return c.json({ code: 0, data: accounts })
  } catch (err: any) {
    return c.json({ code: 500, msg: err.message || 'Error listing accounts' }, 500)
  }
})

// POST /accounts/switch — สลับบัญชีที่ใช้งาน (ตั้งเป็นบัญชีหลักที่สดใหม่ที่สุด)
flowBridge.post('/accounts/switch', async (c) => {
  try {
    const body = await c.req.json()
    const target = body.filename || body.id || body.account_id
    if (!target) {
      return c.json({ code: 400, msg: 'ต้องระบุ filename หรือ id ของบัญชี' }, 400)
    }
    const result = switchFlowAccount(target)
    return c.json({ code: 0, data: result, msg: 'สลับบัญชีสำเร็จ' })
  } catch (err: any) {
    return c.json({ code: 400, msg: err.message || 'Error switching account' }, 400)
  }
})

// POST /accounts/import — นำเข้าหรืออัปเดต Cookie ของบัญชีจาก JSON
flowBridge.post('/accounts/import', async (c) => {
  try {
    const body = await c.req.json()
    const content = body.content !== undefined ? body.content : (body.json !== undefined ? body.json : body)
    const result = await importFlowAccount(content)
    return c.json({ code: 0, data: result, msg: 'นำเข้าบัญชีและบันทึก Cookie สำเร็จ' })
  } catch (err: any) {
    return c.json({ code: 400, msg: err.message || 'Error importing account cookies' }, 400)
  }
})

// DELETE /accounts/:id — ลบบัญชี Cookie
flowBridge.delete('/accounts/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const result = deleteFlowAccount(id)
    return c.json({ code: 0, data: result, msg: 'ลบบัญชีสำเร็จ' })
  } catch (err: any) {
    return c.json({ code: 400, msg: err.message || 'Error deleting account' }, 400)
  }
})

// GET /recent-videos — รายการวิดีโอล่าสุดที่ Google Flow ผลิต
flowBridge.get('/recent-videos', async (c) => {
  try {
    const videos = listRecentFlowVideos()
    return c.json({ code: 0, data: videos })
  } catch (err: any) {
    return c.json({ code: 500, msg: err.message || 'Error listing recent Flow videos' }, 500)
  }
})

// GET /videos/:filename — สตรีมไฟล์วิดีโอจาก output ของ Flow
flowBridge.get('/videos/:filename', async (c) => {
  try {
    const filename = path.basename(c.req.param('filename'))
    const engine = resolveFlowEngine()
    if (!engine) return c.text('Flow Engine not found', 404)

    const filePath = path.join(engine.rootDir, 'output', filename)
    if (!fs.existsSync(filePath)) {
      return c.text('Video not found', 404)
    }

    return await videoFileResponse(filePath, c.req.header('range'))

  } catch (err: any) {
    return c.text(err.message || 'Error streaming video', 500)
  }
})

// POST /apply-to-storyboard — นำวิดีโอ (จาก Flow หรือ URL) ผูกเข้ากับช็อต (Storyboard)
flowBridge.post('/apply-to-storyboard', async (c) => {
  try {
    const body = await c.req.json()
    const storyboardId = Number(body.storyboard_id || body.storyboardId)
    if (!storyboardId) {
      return c.json({ code: 400, msg: 'ต้องระบุ storyboard_id' }, 400)
    }

    const [storyboard] = await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboardId))
    if (!storyboard) {
      return c.json({ code: 404, msg: 'ไม่พบช็อต (Storyboard) ที่ระบุ' }, 404)
    }

    let localPath = ''
    if (body.filename || body.file_path) {
      const target = body.filename || body.file_path
      const copied = await copyFlowVideoToStorage(target)
      localPath = copied.localPath
    } else if (body.video_url || body.videoUrl) {
      localPath = String(body.video_url || body.videoUrl).replace(/^\/+/, '')
    } else {
      return c.json({ code: 400, msg: 'ต้องระบุ filename, file_path หรือ video_url' }, 400)
    }

    // อัปเดต storyboards
    await db.update(schema.storyboards)
      .set({
        videoUrl: localPath,
        updatedAt: now(),
      })
      .where(eq(schema.storyboards.id, storyboardId))

    // บันทึกลง sys_task เป็นงาน completed เพื่อให้ประวัติวิดีโอแสดงผลถูกต้อง
    await db.insert(schema.sysTask).values({
      type: 'video',
      storyboardId,
      dramaId: undefined,
      provider: 'google_flow_import',
      prompt: body.prompt || storyboard.videoPrompt || storyboard.description || 'Imported Video',
      model: 'google-flow-veo',
      status: 'completed',
      resultUrl: localPath,
      localPath,
      createdAt: now(),
      updatedAt: now(),
      completedAt: now(),
    })

    return c.json({
      code: 0,
      data: {
        storyboard_id: storyboardId,
        video_url: localPath,
        url: `/${localPath}`,
      },
      msg: 'ผูกวิดีโอเข้ากับช็อตเรียบร้อยแล้ว',
    })
  } catch (err: any) {
    return c.json({ code: 500, msg: err.message || 'Error applying video to storyboard' }, 500)
  }
})

// GET /v1/models — OpenAI-compatible models list
flowBridge.get('/v1/models', async (c) => {
  return c.json({
    object: 'list',
    data: [
      { id: 'gem_pix_2', object: 'model', created: 1700000000, owned_by: 'google-flow' },
      { id: 'veo_2', object: 'model', created: 1700000000, owned_by: 'google-flow' },
      { id: 'imagen_3', object: 'model', created: 1700000000, owned_by: 'google-flow' },
    ],
  })
})

// POST /v1/images/generations — มาตรฐาน OpenAI Images API
flowBridge.post('/v1/images/generations', async (c) => {
  try {
    const body = await c.req.json()
    const prompt = body.prompt
    if (!prompt) {
      return c.json({ error: { message: 'prompt is required', type: 'invalid_request_error' } }, 400)
    }

    const size = body.size || '1024x1024'
    const model = body.model || 'gem_pix_2'

    const result = await generateFlowImage({
      prompt,
      aspect: size,
      model,
    })

    const reqUrl = new URL(c.req.url)
    const baseUrl = `${reqUrl.protocol}//${reqUrl.host}`
    const fullUrl = result.url.startsWith('http') ? result.url : `${baseUrl}${result.url}`

    return c.json({
      created: Math.floor(Date.now() / 1000),
      data: [
        {
          url: fullUrl,
          local_path: result.localPath,
        },
      ],
      flow: {
        job_id: result.jobId,
      },
    })
  } catch (err: any) {
    console.error('[FlowBridge] Image generation error:', err)
    return c.json({ error: { message: err.message, type: 'api_error' } }, 500)
  }
})

// GET /character-refs/:dramaId — ดึงรายการตัวละครและสถานะการซิงค์ Reference ของซีรีส์
flowBridge.get('/character-refs/:dramaId', async (c) => {
  try {
    const dramaId = Number(c.req.param('dramaId'))
    if (!dramaId) {
      return c.json({ code: 400, msg: 'dramaId ไม่ถูกต้อง' }, 400)
    }
    const data = await getDramaCharacterRefs(dramaId)
    return c.json({ code: 0, data })
  } catch (err: any) {
    return c.json({ code: 500, msg: err.message || 'Error fetching character references' }, 500)
  }
})

// POST /sync-character-refs — ซิงค์รูปตัวละครอ้างอิงของซีรีส์ไปยัง Flow (ส่งครั้งเดียว)
flowBridge.post('/sync-character-refs', async (c) => {
  try {
    const body = await c.req.json()
    const dramaId = Number(body.drama_id || body.dramaId)
    if (!dramaId) {
      return c.json({ code: 400, msg: 'ต้องระบุ drama_id' }, 400)
    }
    const force = Boolean(body.force)
    const characterIds = Array.isArray(body.character_ids || body.characterIds)
      ? (body.character_ids || body.characterIds).map(Number).filter(Boolean)
      : undefined

    const data = await syncDramaCharacterRefsToFlow(dramaId, { force, characterIds })
    return c.json({
      code: 0,
      data,
      msg: `ซิงค์ตัวละครอ้างอิงสำเร็จ (${data.synced_characters}/${data.ready_characters} ตัวละคร)`,
    })
  } catch (err: any) {
    console.error('[FlowBridge] Error syncing character references:', err)
    return c.json({ code: 500, msg: err.message || 'Error syncing character references' }, 500)
  }
})

// POST /v1/video — มาตรฐาน Flow Video Endpoint
flowBridge.post('/v1/video', async (c) => {
  try {
    const body = await c.req.json()
    const prompt = body.prompt
    if (!prompt) {
      return c.json({ error: { message: 'prompt is required' } }, 400)
    }

    const aspect = body.aspect || body.aspect_ratio || '9:16'
    const duration = body.duration ? `${body.duration}` : '4s'
    const quality = body.quality || body.resolution || '360p'
    const startImage = body.start_image || body.startImage || body.first_frame || body.first_frame_url || body.image_url || null
    const referenceImages = Array.isArray(body.reference_images || body.referenceImages)
      ? (body.reference_images || body.referenceImages)
      : undefined
    const referenceMode = body.reference_mode || body.referenceMode || null
    const storyboardId = body.storyboard_id || body.storyboardId ? Number(body.storyboard_id || body.storyboardId) : null

    const result = await generateFlowVideo({
      prompt,
      aspect,
      duration,
      quality,
      startImage,
      referenceImages,
      referenceMode,
      model: body.model || null,
      storyboardId,
    })

    const reqUrl = new URL(c.req.url)
    const baseUrl = `${reqUrl.protocol}//${reqUrl.host}`
    const fullUrl = result.url.startsWith('http') ? result.url : `${baseUrl}${result.url}`

    return c.json({
      status: 'succeeded',
      video_url: fullUrl,
      local_path: result.localPath,
      job_id: result.jobId,
      credits_remaining: result.creditsRemaining,
    })
  } catch (err: any) {
    console.error('[FlowBridge] Video generation error:', err)
    return c.json({ error: { message: err.message } }, 500)
  }
})

// POST /v1/chat/completions — รูปแบบ OpenAI Chat Completions
flowBridge.post('/v1/chat/completions', async (c) => {
  try {
    const body = await c.req.json()
    const messages = body.messages || []
    const lastUserMessage = [...messages].reverse().find((m: any) => m.role === 'user')
    const prompt = typeof lastUserMessage?.content === 'string'
      ? lastUserMessage.content
      : Array.isArray(lastUserMessage?.content)
      ? lastUserMessage.content.find((p: any) => p.type === 'text')?.text || ''
      : ''

    if (!prompt) {
      return c.json({ error: { message: 'No user prompt found in messages' } }, 400)
    }

    const result = await generateFlowImage({ prompt })
    const reqUrl = new URL(c.req.url)
    const baseUrl = `${reqUrl.protocol}//${reqUrl.host}`
    const fullUrl = result.url.startsWith('http') ? result.url : `${baseUrl}${result.url}`

    return c.json({
      id: `chatcmpl-flow-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: body.model || 'google-flow',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: `![generated image](${fullUrl})`,
          },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    })
  } catch (err: any) {
    return c.json({ error: { message: err.message } }, 500)
  }
})
