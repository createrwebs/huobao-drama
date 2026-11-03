import fs from 'node:fs'
import path from 'node:path'
import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, badRequest, notFound, now } from '../utils/response.js'
import { getActor, isServerMode } from '../middleware/auth.js'
import { getDramaIfAuthorized, getStoryboardIfAuthorized } from '../utils/ownership.js'
import {
  getR2ObjectStream,
  getR2ObjectHead,
  getPresignedR2UploadUrl,
  getR2ObjectUrl,
  getR2Config,
} from '../utils/r2-storage.js'
import { generateSignedMediaUrl } from '../utils/crypto.js'
import { generateImage } from '../services/generation.js'

const app = new Hono()

export const WORKER_SECRET_KEY =
  process.env.WORKER_SECRET_KEY || 'tora_colab_worker_secret_2026'

/**
 * Validates worker token for worker runner endpoints (Colab/Kaggle)
 */
function isWorkerAuthorized(c: any): boolean {
  const token =
    c.req.header('X-Worker-Token') ||
    (c.req.header('Authorization')?.startsWith('Bearer ')
      ? c.req.header('Authorization')?.slice(7).trim()
      : null) ||
    c.req.query('token')

  return !!token && token === WORKER_SECRET_KEY
}

/**
 * POST /api/v1/worker/screenshot
 * Generate or register keyframe screenshot from prompt + character reference
 */
app.post('/screenshot', async (c) => {
  const actor = getActor(c)
  const body = await c.req.json().catch(() => ({}))
  const {
    drama_id,
    storyboard_id,
    prompt,
    character_id,
    character_reference_url,
    storyboard_reference_url,
    size = '1024x1024',
  } = body

  if (!drama_id) {
    return badRequest(c, 'drama_id is required')
  }

  // Validate drama ownership
  const drama = await getDramaIfAuthorized(c, Number(drama_id))
  if (!drama) {
    return notFound(c, 'Drama not found')
  }

  let refImages: string[] = []
  if (character_reference_url) {
    refImages.push(character_reference_url)
  }
  if (storyboard_reference_url) {
    refImages.push(storyboard_reference_url)
  }

  // If character_id provided and no url, fetch character avatar
  if (character_id && refImages.length === 0) {
    const [char] = await db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.id, Number(character_id)))
      .limit(1)
    if (char?.imageUrl) {
      refImages.push(char.imageUrl)
    }
  }

  const finalPrompt = prompt || 'Cinematic close-up portrait of character'

  try {
    // Generate image via standard generation pipeline (supporting SDXL, Flux, OpenAI, etc.)
    const taskId = await generateImage({
      ownerUserId: actor?.userId ?? null,
      dramaId: Number(drama_id),
      storyboardId: storyboard_id ? Number(storyboard_id) : undefined,
      characterId: character_id ? Number(character_id) : undefined,
      prompt: finalPrompt,
      size,
      referenceImages: refImages.length > 0 ? refImages : undefined,
    })

    return success(c, {
      task_id: taskId,
      message: 'Screenshot generation task created',
      prompt: finalPrompt,
      reference_images: refImages,
    })
  } catch (err: any) {
    // If no AI image config exists, return character ref or placeholder as screenshot
    if (refImages.length > 0) {
      return success(c, {
        screenshot_url: refImages[0],
        message: 'Using character reference as keyframe screenshot',
        prompt: finalPrompt,
        reference_images: refImages,
      })
    }
    return badRequest(c, `Failed to generate screenshot: ${err?.message || err}`)
  }
})

/**
 * POST /api/v1/worker/jobs
 * Create a new Colab / Kaggle rendering job
 */
app.post('/jobs', async (c) => {
  const actor = getActor(c)
  const isWorker = isWorkerAuthorized(c)
  if (!isWorker && isServerMode() && !actor) {
    return c.json({ code: 401, message: 'Unauthorized' }, 401)
  }
  const body = await c.req.json().catch(() => ({}))
  const {
    storyboard_id,
    drama_id,
    prompt,
    screenshot_url,
    duration = 5,
    resolution = '720p',
    model = 'wan2.1-i2v',
    seed = 42,
  } = body

  if (!storyboard_id || !drama_id) {
    return badRequest(c, 'storyboard_id and drama_id are required')
  }
  if (!screenshot_url) {
    return badRequest(c, 'screenshot_url (approved keyframe) is required')
  }

  // Validate storyboard and drama ownership
  const sbResult = await getStoryboardIfAuthorized(c, Number(storyboard_id))
  if (!sbResult) {
    return notFound(c, 'Storyboard not found')
  }
  const sb = sbResult.storyboard
  const ownerUserId = sbResult.drama.ownerUserId
  if (isServerMode() && ownerUserId === null) {
    return notFound(c, 'Storyboard owner not found')
  }

  const timestamp = Date.now()
  const ownerPrefix = ownerUserId ? `users/${ownerUserId}/` : 'legacy/'
  const r2Key = `${ownerPrefix}dramas/${drama_id}/videos/${storyboard_id}_${timestamp}.mp4`

  // Get pre-signed upload URL for Cloudflare R2
  let presignedUploadUrl = ''
  try {
    presignedUploadUrl = await getPresignedR2UploadUrl(r2Key, 'video/mp4', 86400)
  } catch (e: any) {
    console.warn('Presigned R2 URL generation warning:', e?.message)
  }

  const jobParams = {
    prompt: prompt || sb.videoPrompt || sb.description || '',
    screenshot_url,
    duration: Number(duration),
    resolution,
    model,
    seed: Number(seed),
    r2_key: r2Key,
    presigned_upload_url: presignedUploadUrl,
    created_at: now(),
  }

  // Create sys_task entry
  const [newTask] = await db
    .insert(schema.sysTask)
    .values({
      type: 'video',
      provider: 'colab',
      model,
      status: 'queued',
      storyboardId: Number(storyboard_id),
      dramaId: Number(drama_id),
      prompt: jobParams.prompt,
      ownerUserId: ownerUserId ?? actor?.userId ?? null,
      params: JSON.stringify(jobParams),
      createdAt: now(),
      updatedAt: now(),
    })
    .returning({ id: schema.sysTask.id })

  return success(c, {
    task_id: newTask.id,
    storyboard_id: Number(storyboard_id),
    status: 'queued',
    r2_key: r2Key,
    presigned_upload_url: presignedUploadUrl,
    prompt: jobParams.prompt,
    screenshot_url,
    model,
  })
})

/**
 * GET /api/v1/worker/jobs/poll
 * Worker pulls the next available queued job
 */
app.get('/jobs/poll', async (c) => {
  if (!isWorkerAuthorized(c)) {
    return c.json({ code: 401, message: 'Unauthorized worker token' }, 401)
  }

  // Find oldest queued colab task
  const [task] = await db
    .select()
    .from(schema.sysTask)
    .where(and(eq(schema.sysTask.provider, 'colab'), eq(schema.sysTask.status, 'queued')))
    .orderBy(schema.sysTask.createdAt)
    .limit(1)

  if (!task) {
    return success(c, { has_job: false })
  }

  // Mark task as processing
  await db
    .update(schema.sysTask)
    .set({
      status: 'processing',
      updatedAt: now(),
    })
    .where(eq(schema.sysTask.id, task.id))

  let params: any = {}
  try {
    params = task.params ? JSON.parse(task.params) : {}
  } catch {}

  // Resolve screenshot URL: if local /static path, generate signed URL
  let screenshotUrl = params.screenshot_url || ''
  if (screenshotUrl.startsWith('/static/') || screenshotUrl.startsWith('/storyvdo/static/')) {
    const cleanPath = screenshotUrl.replace(/^\/storyvdo/, '').replace(/^\/static\//, '')
    const signed = generateSignedMediaUrl(cleanPath, 7200)
    const host = c.req.header('host') || 'www.toraapi.com'
    const protocol = c.req.header('x-forwarded-proto') || 'https'
    screenshotUrl = `${protocol}://${host}/storyvdo/static/${signed}`
  }

  return success(c, {
    has_job: true,
    job: {
      task_id: task.id,
      storyboard_id: task.storyboardId,
      drama_id: task.dramaId,
      prompt: params.prompt || task.prompt || '',
      screenshot_url: screenshotUrl,
      duration: params.duration || 5,
      resolution: params.resolution || '720p',
      model: params.model || task.model,
      seed: params.seed || 42,
      r2_key: params.r2_key,
      presigned_upload_url: params.presigned_upload_url,
    },
  })
})

/**
 * POST /api/v1/worker/jobs/:id/complete
 * Worker reports finished render with R2 video URL
 */
app.post('/jobs/:id/complete', async (c) => {
  const taskId = Number(c.req.param('id'))
  const isWorker = isWorkerAuthorized(c)
  const actor = getActor(c)

  const [task] = await db
    .select()
    .from(schema.sysTask)
    .where(eq(schema.sysTask.id, taskId))
    .limit(1)

  if (!task) {
    return notFound(c, 'Task not found')
  }

  // Check auth: either worker token or owner
  if (!isWorker && isServerMode()) {
    if (!actor || task.ownerUserId !== actor.userId) {
      return notFound(c, 'Task not found')
    }
  }

  const body = await c.req.json().catch(() => ({}))
  let { video_url, r2_key, duration_seconds } = body

  if (!video_url && r2_key) {
    video_url = getR2ObjectUrl(r2_key)
  }

  if (!video_url) {
    return badRequest(c, 'video_url or r2_key is required')
  }

  // Update task status
  await db
    .update(schema.sysTask)
    .set({
      status: 'completed',
      resultUrl: video_url,
      completedAt: now(),
      updatedAt: now(),
    })
    .where(eq(schema.sysTask.id, taskId))

  // Update storyboard video_url
  if (task.storyboardId) {
    await db
      .update(schema.storyboards)
      .set({
        videoUrl: video_url,
        duration: duration_seconds ? Number(duration_seconds) : undefined,
        updatedAt: now(),
      })
      .where(eq(schema.storyboards.id, task.storyboardId))
  }

  return success(c, {
    success: true,
    task_id: taskId,
    video_url,
    storyboard_id: task.storyboardId,
  })
})

/**
 * POST /api/v1/worker/jobs/:id/fail
 * Worker reports failed render
 */
app.post('/jobs/:id/fail', async (c) => {
  const taskId = Number(c.req.param('id'))
  const isWorker = isWorkerAuthorized(c)
  const actor = getActor(c)

  const [task] = await db
    .select()
    .from(schema.sysTask)
    .where(eq(schema.sysTask.id, taskId))
    .limit(1)

  if (!task) return notFound(c, 'Task not found')

  if (!isWorker && isServerMode()) {
    if (!actor || task.ownerUserId !== actor.userId) {
      return notFound(c, 'Task not found')
    }
  }

  const body = await c.req.json().catch(() => ({}))
  const errorMsg = body.error_message || 'Video render failed on worker'

  await db
    .update(schema.sysTask)
    .set({
      status: 'failed',
      errorMsg,
      updatedAt: now(),
    })
    .where(eq(schema.sysTask.id, taskId))

  return success(c, { success: true, task_id: taskId, error: errorMsg })
})

/**
 * GET /api/v1/worker/jobs/:id/status
 * Check task status
 */
app.get('/jobs/:id/status', async (c) => {
  const taskId = Number(c.req.param('id'))
  const actor = getActor(c)

  const [task] = await db
    .select()
    .from(schema.sysTask)
    .where(eq(schema.sysTask.id, taskId))
    .limit(1)

  if (!task) return notFound(c, 'Task not found')

  if (isServerMode() && !isWorkerAuthorized(c)) {
    if (!actor || task.ownerUserId !== actor.userId) {
      return notFound(c, 'Task not found')
    }
  }

  return success(c, {
    id: task.id,
    status: task.status,
    error_msg: task.errorMsg,
    video_url: task.resultUrl || null,
    storyboard_id: task.storyboardId,
  })
})

/**
 * GET /api/v1/worker/jobs/:id/notebook
 * Generates an automated, pre-configured Google Colab Notebook for 1-Click execution
 */
app.get('/jobs/:id/notebook', async (c) => {
  const taskId = Number(c.req.param('id'))
  const actor = getActor(c)

  const [task] = await db
    .select()
    .from(schema.sysTask)
    .where(eq(schema.sysTask.id, taskId))
    .limit(1)

  if (!task) return notFound(c, 'Task not found')

  if (isServerMode() && !isWorkerAuthorized(c)) {
    if (!actor || task.ownerUserId !== actor.userId) {
      return notFound(c, 'Task not found')
    }
  }

  let params: any = {}
  try {
    params = task.params ? JSON.parse(task.params) : {}
  } catch {}

  const r2 = getR2Config()
  const host = c.req.header('host') || 'www.toraapi.com'
  const protocol = c.req.header('x-forwarded-proto') || 'https'
  const serverBase = `${protocol}://${host}/storyvdo`

  const notebookJson = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: {
        display_name: 'Python 3',
        language: 'python',
        name: 'python3',
      },
      accelerator: 'GPU',
      colab: {
        name: `Tora_StoryVdo_Job_${taskId}.ipynb`,
      },
    },
    cells: [
      {
        cell_type: 'markdown',
        id: 'title',
        metadata: {},
        source: [
          `# 🎬 Tora StoryVdo Video Renderer (Task #${taskId})\n`,
          `**Prompt:** ${params.prompt || 'Shot animation'}\n\n`,
          `**Instructions:** Go to **Runtime > Change runtime type** and ensure **GPU (T4 or A100)** is selected. Then click **Runtime > Run all**.`,
        ],
      },
      {
        cell_type: 'code',
        id: 'setup',
        metadata: {},
        execution_count: null,
        outputs: [],
        source: [
          `# 1. Install GPU video generation and S3 dependencies\n`,
          `!pip install -q diffusers transformers accelerate boto3 requests pillow imageio imageio-ffmpeg\n`,
        ],
      },
      {
        cell_type: 'code',
        id: 'render_and_upload',
        metadata: {},
        execution_count: null,
        outputs: [],
        source: [
          `import os, sys, json, requests, boto3\n`,
          `from PIL import Image\n`,
          `import torch\n`,
          `from diffusers import TextToVideoSDPipeline, DPMSolverMultistepScheduler\n`,
          `from diffusers.utils import export_to_video\n\n`,
          `task_id = ${taskId}\n`,
          `server_url = "${serverBase}"\n`,
          `worker_token = "${WORKER_SECRET_KEY}"\n`,
          `prompt = ${JSON.stringify(params.prompt || 'Cinematic video motion')}\n`,
          `screenshot_url = ${JSON.stringify(params.screenshot_url || '')}\n`,
          `r2_key = ${JSON.stringify(params.r2_key || `storyvdo/videos/${taskId}.mp4`)}\n`,
          `presigned_url = ${JSON.stringify(params.presigned_upload_url || '')}\n\n`,
          `# Download Keyframe Screenshot\n`,
          `print("[*] Downloading keyframe screenshot...")\n`,
          `if screenshot_url:\n`,
          `    r = requests.get(screenshot_url)\n`,
          `    with open("keyframe.png", "wb") as f:\n`,
          `        f.write(r.content)\n`,
          `    print("[+] Keyframe downloaded.")\n\n`,
          `# Run Video Generation Pipeline\n`,
          `print("[*] Loading Video Diffusion Model on GPU...")\n`,
          `pipe = TextToVideoSDPipeline.from_pretrained("ali-vilab/text-to-video-ms-1.7b", torch_dtype=torch.float16, variant="fp16")\n`,
          `pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config)\n`,
          `pipe.enable_model_cpu_offload()\n`,
          `pipe.enable_vae_slicing()\n\n`,
          `print(f"[*] Rendering video for prompt: '{prompt}'...")\n`,
          `video_frames = pipe(prompt, num_inference_steps=25, height=256, width=384, num_frames=16).frames[0]\n`,
          `output_file = "output.mp4"\n`,
          `export_to_video(video_frames, output_video_path=output_file, fps=8)\n`,
          `print("[+] Video rendered successfully.")\n\n`,
          `# Upload to Cloudflare R2\n`,
          `print("[*] Uploading video to Cloudflare R2...")\n`,
          `if presigned_url:\n`,
          `    with open(output_file, "rb") as f:\n`,
          `        up_res = requests.put(presigned_url, data=f, headers={"Content-Type": "video/mp4"})\n`,
          `        print(f"[+] Upload via presigned URL status: {up_res.status_code}")\n`,
          `else:\n`,
          `    s3 = boto3.client("s3", endpoint_url="${r2.endpoint}", aws_access_key_id="${r2.accessKeyId}", aws_secret_access_key="${r2.secretAccessKey}", region_name="auto")\n`,
          `    s3.upload_file(output_file, "${r2.bucketName}", r2_key, ExtraArgs={"ContentType": "video/mp4"})\n`,
          `    print("[+] Upload via S3 client complete.")\n\n`,
          `# Report completion to Huobao\n`,
          `report_url = f"{server_url}/api/v1/worker/jobs/{task_id}/complete"\n`,
          `res = requests.post(report_url, json={"r2_key": r2_key, "duration_seconds": 2}, headers={"X-Worker-Token": worker_token})\n`,
          `print("[+] Task completion reported to Huobao Drama:", res.json())\n`,
        ],
      },
    ],
  }

  c.header('Content-Type', 'application/x-ipynb+json')
  c.header('Content-Disposition', `attachment; filename="colab_render_task_${taskId}.ipynb"`)
  return c.text(JSON.stringify(notebookJson, null, 2))
})

/**
 * GET /api/v1/worker/r2-stream
 * Streams video object from Cloudflare R2 with HTTP Range 206 support
 */
app.get('/r2-stream', async (c) => {
  const key = c.req.query('key')
  if (!key) return badRequest(c, 'key query parameter required')

  const cleanKey = key.replace(/^\/+/, '')
  const rangeHeader = c.req.header('range')

  try {
    const head = await getR2ObjectHead(cleanKey)
    const totalSize = head.ContentLength || 0
    const contentType = head.ContentType || 'video/mp4'

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d*)-(\d*)/)
      if (match) {
        const start = match[1] ? parseInt(match[1], 10) : 0
        const end = match[2] ? parseInt(match[2], 10) : totalSize - 1
        const chunkSize = end - start + 1

        const s3StreamRes = await getR2ObjectStream(cleanKey, `bytes=${start}-${end}`)

        c.status(206)
        c.header('Content-Range', `bytes ${start}-${end}/${totalSize}`)
        c.header('Accept-Ranges', 'bytes')
        c.header('Content-Length', String(chunkSize))
        c.header('Content-Type', contentType)
        c.header('Cache-Control', 'private, max-age=3600')

        return c.body(s3StreamRes.Body as any)
      }
    }

    const s3Res = await getR2ObjectStream(cleanKey)
    c.status(200)
    c.header('Accept-Ranges', 'bytes')
    c.header('Content-Length', String(totalSize))
    c.header('Content-Type', contentType)
    c.header('Cache-Control', 'private, max-age=3600')

    return c.body(s3Res.Body as any)
  } catch (err: any) {
    return notFound(c, `R2 object not found: ${err?.message || err}`)
  }
})

/**
 * GET /api/v1/worker/script
 * Download the continuous colab_worker.py Python script
 */
app.get('/script', async (c) => {
  const possiblePaths = [
    path.resolve(process.cwd(), 'worker/colab_worker.py'),
    path.resolve(process.cwd(), '../worker/colab_worker.py'),
    '/app/worker/colab_worker.py',
  ]
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf-8')
      c.header('Content-Type', 'text/x-python')
      c.header('Content-Disposition', 'attachment; filename="colab_worker.py"')
      return c.text(content)
    }
  }
  return notFound(c, 'Worker script not found')
})

/**
 * GET /api/v1/worker/notebook
 * Download the standard colab_worker.ipynb notebook
 */
app.get('/notebook', async (c) => {
  const possiblePaths = [
    path.resolve(process.cwd(), 'worker/colab_worker.ipynb'),
    path.resolve(process.cwd(), '../worker/colab_worker.ipynb'),
    '/app/worker/colab_worker.ipynb',
  ]
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf-8')
      c.header('Content-Type', 'application/x-ipynb+json')
      c.header('Content-Disposition', 'attachment; filename="colab_worker.ipynb"')
      return c.body(content)
    }
  }
  return notFound(c, 'Worker notebook not found')
})

export default app
