/**
 * Series Planner Agent Tools
 * ทำงานระดับ drama (ไม่ผูก episode เดียว): อ่านเรื่องย่อ + ข้อมูล drama
 * แล้วสร้าง/บันทึก episodes outline พร้อมบทพูดคร่าว
 */
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { db, getInsertId, schema } from '../../db/index.js'
import { eq, and, isNull, inArray } from 'drizzle-orm'
import { now } from '../../utils/response.js'
import { getDramaId, getEpisodeId } from '../context.js'
import { getContentLanguageFromRC } from '../context.js'
import { logTaskProgress, logTaskSuccess } from '../../utils/task-logger.js'

function getLang(context: any): string {
  return getContentLanguageFromRC(context?.requestContext) || 'th'
}

// อ่านข้อมูล drama และตอนที่มีอยู่แล้ว
const readDramaPlanContext = createTool({
  id: 'read_drama_plan_context',
  description: 'Read the master info of a drama project: synopsis, genre, style, total episodes, and existing episodes.',
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const dramaId = getDramaId(context?.requestContext)
    if (!dramaId) return { error: 'Missing dramaId in request context' }

    const [drama] = await db.select().from(schema.dramas)
      .where(eq(schema.dramas.id, dramaId))
      .limit(1)
    if (!drama) return { error: 'Drama not found' }

    const existing = await db.select().from(schema.episodes)
      .where(and(eq(schema.episodes.dramaId, dramaId), isNull(schema.episodes.deletedAt)))
      .orderBy(schema.episodes.episodeNumber)

    logTaskSuccess('SeriesPlanner', 'read-context', { dramaId, existingEpisodes: existing.length })

    return {
      drama: {
        id: drama.id,
        title: drama.title,
        description: drama.description,
        synopsis: drama.synopsis || drama.description || '',
        genre: drama.genre || '',
        style: drama.style || '',
        aspect_ratio: drama.aspectRatio || '16:9',
        total_episodes_plan: drama.totalEpisodes || 1,
      },
      existing_episodes: existing.map(ep => ({
        episode_number: ep.episodeNumber,
        title: ep.title,
        description: ep.description,
      })),
      language: getLang(context),
    }
  },
})

const saveEpisodesOutlineSchema = z.object({
  episodes: z.array(z.object({
    episode_number: z.number().int().min(1).describe('Episode sequence number, starting from 1'),
    title: z.string().min(1).describe('Episode title'),
    description: z.string().describe('One-paragraph episode synopsis'),
    content: z.string().describe('Formatted outline with rough scene headers and key dialogue lines'),
  })).describe('Array of episode outlines to save'),
})

const saveEpisodesOutline = createTool({
  id: 'save_episodes_outline',
  description: 'Save generated episode outlines to the database. Replaces episodes with matching episode numbers, creates new ones otherwise.',
  inputSchema: saveEpisodesOutlineSchema,
  execute: async ({ episodes }, context) => {
    const dramaId = getDramaId(context?.requestContext)
    if (!dramaId) return { error: 'Missing dramaId in request context' }

    if (!episodes?.length) return { error: 'No episodes provided' }

    const existing = await db.select().from(schema.episodes)
      .where(and(eq(schema.episodes.dramaId, dramaId), isNull(schema.episodes.deletedAt)))

    const byNumber = new Map(existing.map(e => [e.episodeNumber, e]))
    const created: number[] = []
    const updated: number[] = []
    const ts = now()

    for (const ep of episodes) {
      const existingEp = byNumber.get(ep.episode_number)
      if (existingEp) {
        await db.update(schema.episodes)
          .set({
            title: ep.title,
            description: ep.description,
            content: ep.content,
            updatedAt: ts,
          })
          .where(eq(schema.episodes.id, existingEp.id))
        updated.push(existingEp.id)
      } else {
        const insertRes = await db.insert(schema.episodes).values({
          dramaId,
          episodeNumber: ep.episode_number,
          title: ep.title,
          description: ep.description,
          content: ep.content,
          status: 'draft',
          createdAt: ts,
          updatedAt: ts,
        })
        created.push(getInsertId(insertRes))
      }
    }

    // อัปเดตจำนวนตอนจริงใน drama ถ้าเพิ่มขึ้น
    const maxNumber = Math.max(...episodes.map(e => e.episode_number))
    if (maxNumber > 0) {
      await db.update(schema.dramas)
        .set({
          totalEpisodes: maxNumber,
          updatedAt: ts,
        })
        .where(eq(schema.dramas.id, dramaId))
    }

    logTaskSuccess('SeriesPlanner', 'save-outlines', {
      dramaId,
      created: created.length,
      updated: updated.length,
    })

    return {
      created_count: created.length,
      updated_count: updated.length,
      created_ids: created,
      updated_ids: updated,
    }
  },
})

export const seriesTools = { readDramaPlanContext, saveEpisodesOutline }
