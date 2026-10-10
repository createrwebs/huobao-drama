import { Hono } from 'hono'
import { and, eq, isNull } from 'drizzle-orm'
import { db, getInsertId, schema } from '../db/index.js'
import { success, created, badRequest, notFound, now } from '../utils/response.js'
import { toSnakeCase } from '../utils/transform.js'
import { generateImage } from '../services/generation.js'
import { getDramaStylePrompt, applyDramaStyleToPrompt } from '../services/style-preset.js'
import { ensurePropFinalPrompt } from '../services/final-prompt.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { getDramaIfAuthorized, getEpisodeIfAuthorized } from '../utils/ownership.js'

const app = new Hono()
const PROP_IMAGE_SIZE = '1024x1024'

// POST /props — 手动新增道具 (guarded by drama ownership)
app.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.drama_id) return badRequest(c, 'drama_id 必填')
  if (!body.name?.trim()) return badRequest(c, '名称必填')

  const drama = await getDramaIfAuthorized(c, Number(body.drama_id))
  if (!drama) return notFound(c, '剧本不存在')

  if (body.episode_id) {
    const authorizedEp = await getEpisodeIfAuthorized(c, Number(body.episode_id))
    if (!authorizedEp || authorizedEp.drama.id !== drama.id) {
      return notFound(c, '剧集不存在或不属于该剧本')
    }
  }

  const ts = now()
  const res = await db.insert(schema.props).values({
    name: body.name.trim(),
    type: body.type || '',
    description: body.description || '',
    dramaId: drama.id,
    createdAt: ts,
    updatedAt: ts,
  })
  const propId = getInsertId(res)

  if (body.episode_id) {
    const existing = await db
      .select()
      .from(schema.episodeProps)
      .where(
        and(
          eq(schema.episodeProps.episodeId, Number(body.episode_id)),
          eq(schema.episodeProps.propId, propId)
        )
      )
    if (!existing.length) {
      await db.insert(schema.episodeProps).values({ episodeId: Number(body.episode_id), propId, createdAt: ts })
    }
  }
  const [row] = await db.select().from(schema.props).where(eq(schema.props.id, propId))
  return created(c, toSnakeCase(row))
})

// DELETE /props/:id (guarded by drama ownership)
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [prop] = await db.select().from(schema.props).where(and(eq(schema.props.id, id), isNull(schema.props.deletedAt))).limit(1)
  if (!prop) return notFound(c, '道具不存在')

  const drama = await getDramaIfAuthorized(c, prop.dramaId)
  if (!drama) return notFound(c, '道具不存在')

  await db.update(schema.props).set({ deletedAt: now(), updatedAt: now() }).where(eq(schema.props.id, id))
  return success(c)
})

// PUT /props/:id (guarded by drama ownership)
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [prop] = await db.select().from(schema.props).where(and(eq(schema.props.id, id), isNull(schema.props.deletedAt))).limit(1)
  if (!prop) return notFound(c, '道具不存在')

  const drama = await getDramaIfAuthorized(c, prop.dramaId)
  if (!drama) return notFound(c, '道具不存在')

  const body = await c.req.json()
  const updates: Record<string, any> = { updatedAt: now() }
  if (body.name !== undefined) updates.name = body.name
  if (body.type !== undefined) updates.type = body.type
  if (body.description !== undefined) updates.description = body.description

  if (body.image_url !== undefined) updates.imageUrl = body.image_url
  else if (body.imageUrl !== undefined) updates.imageUrl = body.imageUrl
  if (body.local_path !== undefined) updates.localPath = body.local_path
  else if (body.localPath !== undefined) updates.localPath = body.localPath

  if (body.final_prompt !== undefined) updates.finalPrompt = body.final_prompt || null
  else if (body.finalPrompt !== undefined) updates.finalPrompt = body.finalPrompt || null

  await db.update(schema.props).set(updates).where(eq(schema.props.id, id))
  return success(c)
})

function propImagePrompt(prop: typeof schema.props.$inferSelect, stylePrompt = '') {
  return [
    stylePrompt || '',
    `single product photo of ${prop.name}`,
    prop.description || '',
    'isolated on a pure white background',
    'no other objects, no people, no scenery',
    'soft even studio lighting',
    'high detail',
    'no text, no watermark',
  ]
    .filter(Boolean)
    .join(', ')
}

// POST /props/:id/generate-prompt
app.post('/:id/generate-prompt', async (c) => {
  const id = Number(c.req.param('id'))
  const [prop] = await db.select().from(schema.props).where(and(eq(schema.props.id, id), isNull(schema.props.deletedAt))).limit(1)
  if (!prop) return notFound(c, '道具不存在')

  const drama = await getDramaIfAuthorized(c, prop.dramaId)
  if (!drama) return notFound(c, '道具不存在')

  const body = await c.req.json()
  if (!body.episode_id) return badRequest(c, 'episode_id 必填')

  const authorizedEp = await getEpisodeIfAuthorized(c, Number(body.episode_id))
  if (!authorizedEp || authorizedEp.drama.id !== prop.dramaId) {
    return notFound(c, '剧集不存在或不属于该剧本')
  }

  const ep = authorizedEp.episode
  logTaskStart('FinalPrompt', 'prop-generate', { propId: id, episodeId: ep.id, force: !!body.force })
  const finalPrompt = await ensurePropFinalPrompt(prop, ep.id, !!body.force, {
    model: body.text_model,
    configId: body.text_config_id ?? undefined,
  })
  if (!finalPrompt) {
    logTaskError('FinalPrompt', 'prop-generate', { propId: id, error: 'agent returned empty prompt' })
    return badRequest(c, '最终提示词生成失败，请重试')
  }
  logTaskSuccess('FinalPrompt', 'prop-generate', { propId: id })
  return success(c, { final_prompt: finalPrompt })
})

// POST /props/:id/generate-image
app.post('/:id/generate-image', async (c) => {
  const id = Number(c.req.param('id'))
  const [prop] = await db.select().from(schema.props).where(and(eq(schema.props.id, id), isNull(schema.props.deletedAt))).limit(1)
  if (!prop) return notFound(c, '道具不存在')

  const drama = await getDramaIfAuthorized(c, prop.dramaId)
  if (!drama) return notFound(c, '道具不存在')

  const body = await c.req.json()
  if (!body.episode_id) return badRequest(c, 'episode_id 必填')

  const authorizedEp = await getEpisodeIfAuthorized(c, Number(body.episode_id))
  if (!authorizedEp || authorizedEp.drama.id !== prop.dramaId) {
    return notFound(c, '剧集不存在或不属于该剧本')
  }

  const ep = authorizedEp.episode
  const stylePrompt = await getDramaStylePrompt(prop.dramaId)
  const finalPrompt = await ensurePropFinalPrompt(prop, ep.id, false, {
    model: body.text_model,
    configId: body.text_config_id ?? undefined,
  })
  const basePrompt = finalPrompt || propImagePrompt(prop, stylePrompt)
  const prompt = await applyDramaStyleToPrompt(basePrompt, prop.dramaId)

  try {
    logTaskStart('PropImage', 'generate', { propId: id, episodeId: ep.id, dramaId: prop.dramaId })
    const genId = await generateImage({
      propId: id,
      dramaId: prop.dramaId,
      prompt,
      model: body.model,
      size: PROP_IMAGE_SIZE,
      configId: body.config_id ?? ep.imageConfigId ?? undefined,
    })
    logTaskSuccess('PropImage', 'generate', { propId: id, generationId: genId })
    return success(c, { image_generation_id: genId })
  } catch (err: any) {
    logTaskError('PropImage', 'generate', { propId: id, error: err.message })
    return badRequest(c, err.message)
  }
})

export default app
