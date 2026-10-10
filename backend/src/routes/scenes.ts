import { Hono } from 'hono'
import { and, eq, isNull } from 'drizzle-orm'
import { db, getInsertId, schema } from '../db/index.js'
import { success, created, badRequest, notFound, now } from '../utils/response.js'
import { generateImage } from '../services/generation.js'
import { getDramaStylePrompt, applyDramaStyleToPrompt } from '../services/style-preset.js'
import { ensureSceneFinalPrompt } from '../services/final-prompt.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { getDramaIfAuthorized, getEpisodeIfAuthorized } from '../utils/ownership.js'

const app = new Hono()

// POST /scenes — 手动新增场景（guarded by drama ownership）
app.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.drama_id) return badRequest(c, 'drama_id 必填')
  if (!body.location?.trim()) return badRequest(c, '地点必填')

  const drama = await getDramaIfAuthorized(c, Number(body.drama_id))
  if (!drama) return notFound(c, '剧本不存在')

  if (body.episode_id) {
    const authorizedEp = await getEpisodeIfAuthorized(c, Number(body.episode_id))
    if (!authorizedEp || authorizedEp.drama.id !== drama.id) {
      return notFound(c, '剧集不存在或不属于该剧本')
    }
  }

  const ts = now()
  const res = await db.insert(schema.scenes).values({
    dramaId: drama.id,
    episodeId: body.episode_id,
    location: body.location.trim(),
    time: body.time || '',
    prompt: body.prompt || body.description || body.location,
    lighting: body.lighting || '',
    createdAt: ts,
    updatedAt: ts,
  })
  const sceneId = getInsertId(res)

  if (body.episode_id) {
    const existing = await db
      .select()
      .from(schema.episodeScenes)
      .where(
        and(
          eq(schema.episodeScenes.episodeId, Number(body.episode_id)),
          eq(schema.episodeScenes.sceneId, sceneId)
        )
      )
    if (!existing.length) {
      await db.insert(schema.episodeScenes).values({
        episodeId: Number(body.episode_id),
        sceneId,
        createdAt: ts,
      })
    }
  }
  const [result] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, sceneId))
  return created(c, result)
})

// PUT /scenes/:id (guarded by drama ownership)
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [scene] = await db.select().from(schema.scenes).where(and(eq(schema.scenes.id, id), isNull(schema.scenes.deletedAt))).limit(1)
  if (!scene) return notFound(c, '场景不存在')

  const drama = await getDramaIfAuthorized(c, scene.dramaId)
  if (!drama) return notFound(c, '场景不存在')

  const body = await c.req.json()
  const updates: Record<string, any> = { updatedAt: now() }
  if (body.location !== undefined) updates.location = body.location
  if (body.time !== undefined) updates.time = body.time
  if (body.prompt !== undefined) updates.prompt = body.prompt
  if (body.description !== undefined) updates.prompt = body.description
  if (body.lighting !== undefined) updates.lighting = body.lighting

  const uploadedImage = body.image_url ?? body.imageUrl
  if (uploadedImage !== undefined) {
    updates.imageUrl = uploadedImage
    if (uploadedImage) updates.status = 'completed'
  }
  if (body.local_path !== undefined) updates.localPath = body.local_path
  else if (body.localPath !== undefined) updates.localPath = body.localPath

  if (body.final_prompt !== undefined) updates.finalPrompt = body.final_prompt || null
  else if (body.finalPrompt !== undefined) updates.finalPrompt = body.finalPrompt || null

  await db.update(schema.scenes).set(updates).where(eq(schema.scenes.id, id))
  return success(c)
})

// POST /scenes/:id/generate-image (guarded by drama ownership)
app.post('/:id/generate-image', async (c) => {
  const id = Number(c.req.param('id'))
  const [scene] = await db.select().from(schema.scenes).where(and(eq(schema.scenes.id, id), isNull(schema.scenes.deletedAt))).limit(1)
  if (!scene) return notFound(c, '场景不存在')

  const drama = await getDramaIfAuthorized(c, scene.dramaId)
  if (!drama) return notFound(c, '场景不存在')

  const body = await c.req.json()
  if (!body.episode_id) return badRequest(c, 'episode_id 必填')

  const authorizedEp = await getEpisodeIfAuthorized(c, Number(body.episode_id))
  if (!authorizedEp || authorizedEp.drama.id !== scene.dramaId) {
    return notFound(c, '剧集不存在或不属于该剧本')
  }

  const ep = authorizedEp.episode
  const stylePrompt = await getDramaStylePrompt(scene.dramaId)
  const finalPrompt = await ensureSceneFinalPrompt(scene, ep.id, false, {
    model: body.text_model,
    configId: body.text_config_id ?? undefined,
  })

  const basePrompt =
    finalPrompt ||
    [
      stylePrompt || '',
      scene.location,
      scene.time || '',
      scene.prompt || '',
      scene.lighting || 'cinematic lighting',
      'empty scene, no people, wide establishing shot, high quality',
    ]
      .filter(Boolean)
      .join(', ')

  const prompt = await applyDramaStyleToPrompt(basePrompt, scene.dramaId)

  try {
    logTaskStart('SceneImage', 'generate', { sceneId: id, episodeId: ep.id, dramaId: scene.dramaId, location: scene.location })
    await db.update(schema.scenes).set({ status: 'processing', updatedAt: now() }).where(eq(schema.scenes.id, id))
    const genId = await generateImage({
      sceneId: id,
      dramaId: scene.dramaId,
      prompt,
      model: body.model,
      configId: body.config_id ?? ep.imageConfigId ?? undefined,
    })
    logTaskSuccess('SceneImage', 'generate', { sceneId: id, generationId: genId })
    return success(c, { image_generation_id: genId })
  } catch (err: any) {
    logTaskError('SceneImage', 'generate', { sceneId: id, error: err.message })
    await db.update(schema.scenes).set({ status: 'failed', updatedAt: now() }).where(eq(schema.scenes.id, id))
    return badRequest(c, err.message)
  }
})

// POST /scenes/:id/generate-prompt
app.post('/:id/generate-prompt', async (c) => {
  const id = Number(c.req.param('id'))
  const [scene] = await db.select().from(schema.scenes).where(and(eq(schema.scenes.id, id), isNull(schema.scenes.deletedAt))).limit(1)
  if (!scene) return notFound(c, '场景不存在')

  const drama = await getDramaIfAuthorized(c, scene.dramaId)
  if (!drama) return notFound(c, '场景不存在')

  const body = await c.req.json()
  if (!body.episode_id) return badRequest(c, 'episode_id 必填')

  const authorizedEp = await getEpisodeIfAuthorized(c, Number(body.episode_id))
  if (!authorizedEp || authorizedEp.drama.id !== scene.dramaId) {
    return notFound(c, '剧集不存在或不属于该剧本')
  }

  const ep = authorizedEp.episode
  logTaskStart('FinalPrompt', 'scene-generate', { sceneId: id, episodeId: ep.id, force: !!body.force })
  const finalPrompt = await ensureSceneFinalPrompt(scene, ep.id, !!body.force, {
    model: body.text_model,
    configId: body.text_config_id ?? undefined,
  })
  if (!finalPrompt) {
    logTaskError('FinalPrompt', 'scene-generate', { sceneId: id, error: 'agent returned empty prompt' })
    return badRequest(c, '最终提示词生成失败，请重试')
  }
  logTaskSuccess('FinalPrompt', 'scene-generate', { sceneId: id })
  return success(c, { final_prompt: finalPrompt })
})

// DELETE /scenes/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [scene] = await db.select().from(schema.scenes).where(and(eq(schema.scenes.id, id), isNull(schema.scenes.deletedAt))).limit(1)
  if (!scene) return notFound(c, '场景不存在')

  const drama = await getDramaIfAuthorized(c, scene.dramaId)
  if (!drama) return notFound(c, '场景不存在')

  await db.update(schema.scenes).set({ deletedAt: now(), updatedAt: now() }).where(eq(schema.scenes.id, id))
  return success(c)
})

export default app
