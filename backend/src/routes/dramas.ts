import { Hono } from 'hono'
import { and, eq, isNull, desc } from 'drizzle-orm'
import { db, getInsertId, schema } from '../db/index.js'
import { success, notFound, created, badRequest, now } from '../utils/response.js'
import { toSnakeCase, toSnakeCaseArray } from '../utils/transform.js'
import { syncDramaAssetStylePrompts } from '../services/style-preset.js'
import { getActor } from '../middleware/auth.js'
import { getDramaIfAuthorized, getDramaOwnerCondition } from '../utils/ownership.js'
import { mastra } from '../mastra/index.js'
import { buildSeriesPlannerRequestContext } from '../agents/context.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

const app = new Hono()

// GET /dramas - List dramas scoped to authenticated owner
app.get('/', async (c) => {
  const page = Number(c.req.query('page') || 1)
  const pageSize = Number(c.req.query('page_size') || 20)
  const status = c.req.query('status')
  const keyword = c.req.query('keyword')

  const actor = getActor(c)
  const ownerCond = getDramaOwnerCondition(actor)

  const allRows = await db
    .select()
    .from(schema.dramas)
    .where(and(ownerCond, isNull(schema.dramas.deletedAt)))
    .orderBy(desc(schema.dramas.updatedAt))

  let filtered = allRows

  if (status) filtered = filtered.filter((d) => d.status === status)
  if (keyword) filtered = filtered.filter((d) => d.title.includes(keyword))

  const total = filtered.length
  const items = filtered.slice((page - 1) * pageSize, page * pageSize)

  // Attach episode/character/scene counts
  const enriched = await Promise.all(
    items.map(async (drama) => {
      const eps = await db
        .select()
        .from(schema.episodes)
        .where(and(eq(schema.episodes.dramaId, drama.id), isNull(schema.episodes.deletedAt)))
      const chars = await db
        .select()
        .from(schema.characters)
        .where(eq(schema.characters.dramaId, drama.id))
      const scns = await db
        .select()
        .from(schema.scenes)
        .where(eq(schema.scenes.dramaId, drama.id))
      return {
        ...toSnakeCase(drama),
        tags: drama.tags ? JSON.parse(drama.tags) : [],
        total_episodes: eps.length,
        episodes: toSnakeCaseArray(eps),
        characters: toSnakeCaseArray(chars),
        scenes: toSnakeCaseArray(scns),
      }
    })
  )

  return success(c, {
    items: enriched,
    pagination: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) },
  })
})

// POST /dramas - Create drama owned by current authenticated user
app.post('/', async (c) => {
  const body = await c.req.json()
  const actor = getActor(c)
  const ts = now()

  const totalEpisodesRaw = body.total_episodes ?? body.total_episodes_plan ?? 1
  const totalEpisodes = Number.isInteger(Number(totalEpisodesRaw)) && Number(totalEpisodesRaw) > 0
    ? Number(totalEpisodesRaw)
    : 1

  const res = await db.insert(schema.dramas).values({
    ownerUserId: actor?.userId ?? null,
    title: body.title,
    description: body.description,
    synopsis: body.synopsis || null,
    genre: body.genre,
    style: body.style,
    aspectRatio: body.aspect_ratio || '16:9',
    totalEpisodes,
    tags: body.tags ? JSON.stringify(body.tags) : null,
    metadata: body.metadata,
    status: 'draft',
    createdAt: ts,
    updatedAt: ts,
  })

  const [result] = await db
    .select()
    .from(schema.dramas)
    .where(eq(schema.dramas.id, getInsertId(res)))

  return created(c, toSnakeCase(result))
})

// GET /dramas/stats — stats scoped to owner
app.get('/stats', async (c) => {
  const actor = getActor(c)
  const ownerCond = getDramaOwnerCondition(actor)

  const all = await db
    .select()
    .from(schema.dramas)
    .where(and(ownerCond, isNull(schema.dramas.deletedAt)))

  const byStatus = Object.entries(
    all.reduce((acc, d) => {
      acc[d.status || 'draft'] = (acc[d.status || 'draft'] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  ).map(([status, count]) => ({ status, count }))

  return success(c, { total: all.length, by_status: byStatus })
})

// GET /dramas/:id - Get drama detail (with strict ownership guard)
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const drama = await getDramaIfAuthorized(c, id)
  if (!drama) return notFound(c, '剧本不存在')

  const eps = await db
    .select()
    .from(schema.episodes)
    .where(and(eq(schema.episodes.dramaId, id), isNull(schema.episodes.deletedAt)))
  const chars = await db
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.dramaId, id))
  const scns = await db
    .select()
    .from(schema.scenes)
    .where(eq(schema.scenes.dramaId, id))
  const prps = await db
    .select()
    .from(schema.props)
    .where(eq(schema.props.dramaId, id))

  return success(c, {
    ...toSnakeCase(drama),
    tags: drama.tags ? JSON.parse(drama.tags) : [],
    episodes: toSnakeCaseArray(eps),
    characters: toSnakeCaseArray(chars),
    scenes: toSnakeCaseArray(scns),
    props: toSnakeCaseArray(prps),
  })
})

// PUT /dramas/:id - Update drama (ownership guarded)
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const drama = await getDramaIfAuthorized(c, id)
  if (!drama) return notFound(c, '剧本不存在')

  const body = await c.req.json()
  const updates: Record<string, any> = { updatedAt: now() }
  if (body.title !== undefined) updates.title = body.title
  if (body.description !== undefined) updates.description = body.description
  if (body.synopsis !== undefined) updates.synopsis = body.synopsis || null
  if (body.genre !== undefined) updates.genre = body.genre
  if (body.style !== undefined) updates.style = body.style
  if (body.aspect_ratio !== undefined) updates.aspectRatio = body.aspect_ratio
  if (body.status !== undefined) updates.status = body.status
  if (body.tags !== undefined) updates.tags = JSON.stringify(body.tags)
  if (body.metadata !== undefined) updates.metadata = body.metadata
  if (body.total_episodes !== undefined) {
    const n = Number(body.total_episodes)
    updates.totalEpisodes = Number.isInteger(n) && n > 0 ? n : drama.totalEpisodes
  }

  // Never allow overwriting ownerUserId from body
  delete updates.ownerUserId
  delete updates.owner_user_id

  await db.update(schema.dramas).set(updates).where(eq(schema.dramas.id, id))
  if (body.style !== undefined) {
    await syncDramaAssetStylePrompts(id, body.style)
  }
  return success(c)
})

// DELETE /dramas/:id - Soft delete (ownership guarded)
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const drama = await getDramaIfAuthorized(c, id)
  if (!drama) return notFound(c, '剧本不存在')

  await db.update(schema.dramas).set({ deletedAt: now() }).where(eq(schema.dramas.id, id))
  return success(c)
})

function normalizeToolResult(entry: any) {
  return entry?.payload?.result ?? entry?.result ?? entry?.payload?.output ?? entry?.output ?? entry?.data ?? null
}

// POST /dramas/:id/generate-episodes - AI 根据 synopsis 拆分为 episodes
app.post('/:id/generate-episodes', async (c) => {
  const id = Number(c.req.param('id'))
  const drama = await getDramaIfAuthorized(c, id)
  if (!drama) return notFound(c, '剧本不存在')

  const body = await c.req.json().catch(() => ({}))
  const totalEpisodes = Number.isInteger(body.total_episodes)
    ? Number(body.total_episodes)
    : Number(drama.totalEpisodes || 1)
  const synopsis = String(body.synopsis ?? drama.synopsis ?? drama.description ?? '').trim()

  if (!synopsis && !drama.title && !body.title) {
    return badRequest(c, '需要有 synopsis 或 title 才能生成 episodes')
  }

  // 持久化用户确认后的 synopsis / total_episodes
  const updates: any = { updatedAt: now() }
  if (body.total_episodes !== undefined) updates.totalEpisodes = totalEpisodes
  if (body.synopsis !== undefined) updates.synopsis = synopsis
  if (Object.keys(updates).length > 1) {
    await db.update(schema.dramas).set(updates).where(eq(schema.dramas.id, id))
  }

  const agent = mastra.getAgent('series_planner')
  if (!agent) return badRequest(c, 'Series planner agent 未注册')

  const requestContext = buildSeriesPlannerRequestContext({ dramaId: id })
  const message = `请为短剧《${drama.title}》生成 ${totalEpisodes} 集的分集大纲。${synopsis ? '\n全剧 synopsis：\n' + synopsis : ''}\n风格：${drama.style || '未指定'}，画幅：${drama.aspectRatio || '16:9'}。`

  logTaskStart('SeriesPlanner', 'generate-episodes', { dramaId: id, totalEpisodes })

  try {
    const result = await agent.generate(
      [{ role: 'user', content: message }],
      { maxSteps: 20, requestContext },
    )

    // 从 save_episodes_outline tool result 读取生成/更新数量
    const saveResult = (result.toolResults || []).find((tr: any) => {
      const name = tr?.payload?.toolName || tr?.toolName || tr?.tool?.toolName
      return name === 'save_episodes_outline'
    })
    const savedResult: any = saveResult ? normalizeToolResult(saveResult) : null

    const episodes = await db
      .select()
      .from(schema.episodes)
      .where(and(eq(schema.episodes.dramaId, id), isNull(schema.episodes.deletedAt)))
      .orderBy(schema.episodes.episodeNumber)

    logTaskSuccess('SeriesPlanner', 'generate-episodes', {
      dramaId: id,
      created: savedResult?.created_count ?? 0,
      updated: savedResult?.updated_count ?? 0,
      totalEpisodes: episodes.length,
    })

    return success(c, {
      created_count: savedResult?.created_count ?? 0,
      updated_count: savedResult?.updated_count ?? 0,
      episodes: toSnakeCaseArray(episodes),
      text: result.text || '',
    })
  } catch (err: any) {
    logTaskError('SeriesPlanner', 'generate-episodes', { dramaId: id, error: err.message })
    return badRequest(c, err.message || 'AI 生成 episodes 失败')
  }
})

// PUT /dramas/:id/characters - Save characters (ownership guarded)
app.put('/:id/characters', async (c) => {
  const dramaId = Number(c.req.param('id'))
  const drama = await getDramaIfAuthorized(c, dramaId)
  if (!drama) return notFound(c, '剧本不存在')

  const body = await c.req.json()
  const chars = body.characters || []
  const ts = now()

  for (const char of chars) {
    if (char.id) {
      // Ensure the character being updated belongs to this drama
      const [existingChar] = await db
        .select()
        .from(schema.characters)
        .where(and(eq(schema.characters.id, char.id), eq(schema.characters.dramaId, dramaId)))
        .limit(1)
      if (existingChar) {
        await db
          .update(schema.characters)
          .set({ ...char, updatedAt: ts })
          .where(eq(schema.characters.id, char.id))
      }
    } else {
      await db.insert(schema.characters).values({ ...char, dramaId, createdAt: ts, updatedAt: ts })
    }
  }
  return success(c)
})

// PUT /dramas/:id/episodes - Save episodes (ownership guarded)
app.put('/:id/episodes', async (c) => {
  const dramaId = Number(c.req.param('id'))
  const drama = await getDramaIfAuthorized(c, dramaId)
  if (!drama) return notFound(c, '剧本不存在')

  const body = await c.req.json()
  const episodes = body.episodes || []
  const ts = now()

  for (const ep of episodes) {
    if (ep.id) {
      const [existingEp] = await db
        .select()
        .from(schema.episodes)
        .where(and(eq(schema.episodes.id, ep.id), eq(schema.episodes.dramaId, dramaId)))
        .limit(1)
      if (existingEp) {
        await db
          .update(schema.episodes)
          .set({ ...ep, updatedAt: ts })
          .where(eq(schema.episodes.id, ep.id))
      }
    } else {
      await db.insert(schema.episodes).values({
        ...ep,
        dramaId,
        episodeNumber: ep.episode_number || ep.episodeNumber || 1,
        title: ep.title || '未命名',
        createdAt: ts,
        updatedAt: ts,
      })
    }
  }
  return success(c)
})

export default app
