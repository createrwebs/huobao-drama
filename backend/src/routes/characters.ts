import { Hono } from 'hono'
import { and, eq, isNull } from 'drizzle-orm'
import { db, getInsertId, schema } from '../db/index.js'
import { success, created, badRequest, notFound, now } from '../utils/response.js'
import { toSnakeCase } from '../utils/transform.js'
import { generateImage } from '../services/generation.js'
import { getDramaStylePrompt, applyDramaStyleToPrompt } from '../services/style-preset.js'
import { ensureCharacterFinalPrompt } from '../services/final-prompt.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { getDramaIfAuthorized, getEpisodeIfAuthorized, validateDramaOwnershipOfEntities } from '../utils/ownership.js'

const app = new Hono()
const CHARACTER_IMAGE_SIZE = '1920x1080'

// POST /characters — 手动新增角色（guarded by drama ownership）
app.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.drama_id) return badRequest(c, 'drama_id 必填')
  if (!body.name?.trim()) return badRequest(c, '名称必填')

  const drama = await getDramaIfAuthorized(c, Number(body.drama_id))
  if (!drama) return notFound(c, '剧本不存在')

  if (body.episode_id) {
    const authorizedEp = await getEpisodeIfAuthorized(c, Number(body.episode_id))
    if (!authorizedEp || authorizedEp.drama.id !== drama.id) {
      return notFound(c, '剧集不存在或不属于当前剧本')
    }
  }

  const ts = now()
  const res = await db.insert(schema.characters).values({
    name: body.name.trim(),
    role: body.role || '',
    description: body.description || '',
    appearance: body.appearance || '',
    styling: body.styling || '',
    dramaId: drama.id,
    createdAt: ts,
    updatedAt: ts,
  })
  const charId = getInsertId(res)

  if (body.episode_id) {
    const existing = await db
      .select()
      .from(schema.episodeCharacters)
      .where(
        and(
          eq(schema.episodeCharacters.episodeId, Number(body.episode_id)),
          eq(schema.episodeCharacters.characterId, charId)
        )
      )
    if (!existing.length) {
      await db
        .insert(schema.episodeCharacters)
        .values({ episodeId: Number(body.episode_id), characterId: charId, createdAt: ts })
    }
  }
  const [row] = await db.select().from(schema.characters).where(eq(schema.characters.id, charId))
  return created(c, toSnakeCase(row))
})

function characterImagePrompt(char: typeof schema.characters.$inferSelect, stylePrompt = '') {
  return [
    stylePrompt || '',
    char.name,
    char.appearance || char.description || '',
    char.styling || '',
    'character reference sheet, left frontal face close-up and right three equal-height full-body views of the same character: front, 90-degree side, back',
    'neutral A-pose, identical face hairstyle and clothing across views, entire body including feet visible',
    'high quality',
    'white background',
  ]
    .filter(Boolean)
    .join(', ')
}

// PUT /characters/:id (guarded by drama ownership)
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [char] = await db.select().from(schema.characters).where(and(eq(schema.characters.id, id), isNull(schema.characters.deletedAt))).limit(1)
  if (!char) return notFound(c, '角色不存在')

  const drama = await getDramaIfAuthorized(c, char.dramaId)
  if (!drama) return notFound(c, '角色不存在')

  const body = await c.req.json()
  const updates: Record<string, any> = { updatedAt: now() }
  for (const key of ['name', 'role', 'description', 'appearance', 'styling', 'imageUrl', 'localPath']) {
    const snakeKey = key.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase())
    if (snakeKey in body) updates[key] = body[snakeKey]
    else if (key in body) updates[key] = body[key]
  }
  if (body.final_prompt !== undefined) updates.finalPrompt = body.final_prompt || null
  else if (body.finalPrompt !== undefined) updates.finalPrompt = body.finalPrompt || null

  await db.update(schema.characters).set(updates).where(eq(schema.characters.id, id))
  return success(c)
})

// DELETE /characters/:id (guarded by drama ownership)
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [char] = await db.select().from(schema.characters).where(and(eq(schema.characters.id, id), isNull(schema.characters.deletedAt))).limit(1)
  if (!char) return notFound(c, '角色不存在')

  const drama = await getDramaIfAuthorized(c, char.dramaId)
  if (!drama) return notFound(c, '角色不存在')

  await db.update(schema.characters).set({ deletedAt: now() }).where(eq(schema.characters.id, id))
  return success(c)
})

// POST /characters/:id/generate-image (guarded by drama & episode ownership)
app.post('/:id/generate-image', async (c) => {
  const id = Number(c.req.param('id'))
  const [char] = await db.select().from(schema.characters).where(and(eq(schema.characters.id, id), isNull(schema.characters.deletedAt))).limit(1)
  if (!char) return notFound(c, '角色不存在')

  const drama = await getDramaIfAuthorized(c, char.dramaId)
  if (!drama) return notFound(c, '角色不存在')

  const body = await c.req.json()
  if (!body.episode_id) return badRequest(c, 'episode_id 必填')

  const authorizedEp = await getEpisodeIfAuthorized(c, Number(body.episode_id))
  if (!authorizedEp || authorizedEp.drama.id !== char.dramaId) {
    return notFound(c, '剧集不存在或不属于该剧本')
  }

  const ep = authorizedEp.episode
  const stylePrompt = await getDramaStylePrompt(char.dramaId)
  const finalPrompt = await ensureCharacterFinalPrompt(char, ep.id, false, {
    model: body.text_model,
    configId: body.text_config_id ?? undefined,
  })
  const basePrompt = finalPrompt || characterImagePrompt(char, stylePrompt)
  const prompt = await applyDramaStyleToPrompt(basePrompt, char.dramaId)

  try {
    logTaskStart('CharacterImage', 'generate', { characterId: id, episodeId: ep.id, dramaId: char.dramaId })
    const genId = await generateImage({
      characterId: id,
      dramaId: char.dramaId,
      prompt,
      model: body.model,
      size: CHARACTER_IMAGE_SIZE,
      configId: body.config_id ?? ep.imageConfigId ?? undefined,
    })
    logTaskSuccess('CharacterImage', 'generate', { characterId: id, generationId: genId })
    return success(c, { image_generation_id: genId })
  } catch (err: any) {
    logTaskError('CharacterImage', 'generate', { characterId: id, error: err.message })
    return badRequest(c, err.message)
  }
})

// POST /characters/:id/generate-prompt
app.post('/:id/generate-prompt', async (c) => {
  const id = Number(c.req.param('id'))
  const [char] = await db.select().from(schema.characters).where(and(eq(schema.characters.id, id), isNull(schema.characters.deletedAt))).limit(1)
  if (!char) return notFound(c, '角色不存在')

  const drama = await getDramaIfAuthorized(c, char.dramaId)
  if (!drama) return notFound(c, '角色不存在')

  const body = await c.req.json()
  if (!body.episode_id) return badRequest(c, 'episode_id 必填')

  const authorizedEp = await getEpisodeIfAuthorized(c, Number(body.episode_id))
  if (!authorizedEp || authorizedEp.drama.id !== char.dramaId) {
    return notFound(c, '剧集不存在或不属于该剧本')
  }

  const ep = authorizedEp.episode
  logTaskStart('FinalPrompt', 'character-generate', { characterId: id, episodeId: ep.id, force: !!body.force })
  const finalPrompt = await ensureCharacterFinalPrompt(char, ep.id, !!body.force, {
    model: body.text_model,
    configId: body.text_config_id ?? undefined,
  })
  if (!finalPrompt) {
    logTaskError('FinalPrompt', 'character-generate', { characterId: id, error: 'agent returned empty prompt' })
    return badRequest(c, '最终提示词生成失败，请重试')
  }
  logTaskSuccess('FinalPrompt', 'character-generate', { characterId: id })
  return success(c, { final_prompt: finalPrompt })
})

// POST /characters/batch-generate-images (batch ownership verification)
app.post('/batch-generate-images', async (c) => {
  const body = await c.req.json()
  const ids: number[] = body.character_ids || []
  if (!body.episode_id) return badRequest(c, 'episode_id 必填')

  const authorizedEp = await getEpisodeIfAuthorized(c, Number(body.episode_id))
  if (!authorizedEp) return notFound(c, '剧集不存在')

  const ep = authorizedEp.episode

  // Validate that all character IDs belong to this drama
  const validBatch = await validateDramaOwnershipOfEntities(ep.dramaId, { characterIds: ids })
  if (!validBatch) {
    return badRequest(c, '角色列表中存在无效或跨租户的 character_id')
  }

  const results: number[] = []
  const stylePrompt = await getDramaStylePrompt(ep.dramaId)
  for (const cid of ids) {
    const [char] = await db.select().from(schema.characters).where(eq(schema.characters.id, cid))
    if (!char) continue
    const finalPrompt = await ensureCharacterFinalPrompt(char, ep.id, false, {
      model: body.text_model,
      configId: body.text_config_id ?? undefined,
    })
    const basePrompt = finalPrompt || characterImagePrompt(char, stylePrompt)
    const prompt = await applyDramaStyleToPrompt(basePrompt, ep.dramaId)
    try {
      const genId = await generateImage({
        characterId: cid,
        dramaId: char.dramaId,
        prompt,
        model: body.model,
        size: CHARACTER_IMAGE_SIZE,
        configId: body.config_id ?? ep.imageConfigId ?? undefined,
      })
      results.push(genId)
    } catch {}
  }
  logTaskSuccess('CharacterImage', 'batch-generate', { episodeId: ep.id, requested: ids.length, started: results.length })
  return success(c, { count: results.length, ids: results })
})

export default app
