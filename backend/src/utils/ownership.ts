import type { Context } from 'hono'
import { and, eq, isNull, or, inArray } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { getActor, isServerMode, type AuthenticatedActor } from '../middleware/auth.js'

/**
 * Checks if a drama is accessible to the given request context.
 * In server mode: drama.ownerUserId must match actor.userId.
 * In local mode: returns drama if unowned or owned by actor.
 */
export async function getDramaIfAuthorized(
  c: Context,
  dramaId: number
): Promise<typeof schema.dramas.$inferSelect | null> {
  const actor = getActor(c)
  const [drama] = await db
    .select()
    .from(schema.dramas)
    .where(and(eq(schema.dramas.id, dramaId), isNull(schema.dramas.deletedAt)))
    .limit(1)

  if (!drama) return null

  if (isServerMode()) {
    if (!actor || drama.ownerUserId !== actor.userId) {
      return null
    }
    return drama
  }

  // Local / desktop mode
  if (actor) {
    if (drama.ownerUserId !== null && drama.ownerUserId !== actor.userId) {
      return null
    }
  }
  return drama
}

/**
 * Checks if an episode is accessible, verifying that its parent drama is owned by the actor.
 */
export async function getEpisodeIfAuthorized(
  c: Context,
  episodeId: number
): Promise<{
  episode: typeof schema.episodes.$inferSelect
  drama: typeof schema.dramas.$inferSelect
} | null> {
  const [episode] = await db
    .select()
    .from(schema.episodes)
    .where(and(eq(schema.episodes.id, episodeId), isNull(schema.episodes.deletedAt)))
    .limit(1)

  if (!episode) return null

  const drama = await getDramaIfAuthorized(c, episode.dramaId)
  if (!drama) return null

  return { episode, drama }
}

/**
 * Checks if a storyboard is accessible, verifying parent episode and drama ownership.
 */
export async function getStoryboardIfAuthorized(
  c: Context,
  storyboardId: number
): Promise<{
  storyboard: typeof schema.storyboards.$inferSelect
  episode: typeof schema.episodes.$inferSelect
  drama: typeof schema.dramas.$inferSelect
} | null> {
  const [storyboard] = await db
    .select()
    .from(schema.storyboards)
    .where(and(eq(schema.storyboards.id, storyboardId), isNull(schema.storyboards.deletedAt)))
    .limit(1)

  if (!storyboard) return null

  const parent = await getEpisodeIfAuthorized(c, storyboard.episodeId)
  if (!parent) return null

  return { storyboard, episode: parent.episode, drama: parent.drama }
}

/**
 * Validates that an array of entity IDs all belong to the specified drama.
 * Prevents mixed-owner or forged reference ID batch injection attacks.
 */
export async function validateDramaOwnershipOfEntities(
  dramaId: number,
  entities: {
    characterIds?: number[]
    sceneIds?: number[]
    propIds?: number[]
    episodeIds?: number[]
    storyboardIds?: number[]
  }
): Promise<boolean> {
  if (entities.characterIds?.length) {
    const chars = await db
      .select({ id: schema.characters.id })
      .from(schema.characters)
      .where(
        and(
          inArray(schema.characters.id, entities.characterIds),
          eq(schema.characters.dramaId, dramaId),
          isNull(schema.characters.deletedAt)
        )
      )
    if (chars.length !== entities.characterIds.length) return false
  }

  if (entities.sceneIds?.length) {
    const scns = await db
      .select({ id: schema.scenes.id })
      .from(schema.scenes)
      .where(
        and(
          inArray(schema.scenes.id, entities.sceneIds),
          eq(schema.scenes.dramaId, dramaId),
          isNull(schema.scenes.deletedAt)
        )
      )
    if (scns.length !== entities.sceneIds.length) return false
  }

  if (entities.propIds?.length) {
    const prps = await db
      .select({ id: schema.props.id })
      .from(schema.props)
      .where(
        and(
          inArray(schema.props.id, entities.propIds),
          eq(schema.props.dramaId, dramaId),
          isNull(schema.props.deletedAt)
        )
      )
    if (prps.length !== entities.propIds.length) return false
  }

  if (entities.episodeIds?.length) {
    const eps = await db
      .select({ id: schema.episodes.id })
      .from(schema.episodes)
      .where(
        and(
          inArray(schema.episodes.id, entities.episodeIds),
          eq(schema.episodes.dramaId, dramaId),
          isNull(schema.episodes.deletedAt)
        )
      )
    if (eps.length !== entities.episodeIds.length) return false
  }

  if (entities.storyboardIds?.length) {
    const sbs = await db
      .select({ id: schema.storyboards.id })
      .from(schema.storyboards)
      .innerJoin(schema.episodes, eq(schema.storyboards.episodeId, schema.episodes.id))
      .where(
        and(
          inArray(schema.storyboards.id, entities.storyboardIds),
          eq(schema.episodes.dramaId, dramaId),
          isNull(schema.storyboards.deletedAt)
        )
      )
    if (sbs.length !== entities.storyboardIds.length) return false
  }

  return true
}

/**
 * Returns SQL where condition for dramas query matching actor ownership.
 */
export function getDramaOwnerCondition(actor: AuthenticatedActor | null) {
  if (isServerMode()) {
    if (!actor) {
      // In server mode without actor, matches nothing
      return eq(schema.dramas.id, -1)
    }
    return eq(schema.dramas.ownerUserId, actor.userId)
  }

  // Local mode
  if (actor) {
    return or(eq(schema.dramas.ownerUserId, actor.userId), isNull(schema.dramas.ownerUserId))
  }
  return isNull(schema.dramas.ownerUserId)
}
