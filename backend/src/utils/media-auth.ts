import fs from 'node:fs'
import path from 'node:path'
import type { Context } from 'hono'
import { eq, or, like } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { DATA_ROOT, STORAGE_ROOT } from './paths.js'
import { getActor, isServerMode } from '../middleware/auth.js'
import { verifySignedMediaUrl } from './crypto.js'
import { videoFileResponse } from './video-file-response.js'

const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.m4v': 'video/x-m4v',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
}

/**
 * Resolves the ownerUserId of a media file by inspecting the database records.
 * Returns:
 * - number: the owner's userId
 * - null: the file is legacy unowned data
 * - undefined: no record references this file
 */
export async function resolveMediaOwner(cleanPath: string): Promise<number | null | undefined> {
  const filename = path.basename(cleanPath)
  // Strip thumbnail/poster suffixes if present
  const baseFilename = filename.replace(/\.(thumb\.webp|poster\.jpg)$/, '')

  // 1. Assets table
  const [asset] = await db
    .select({ ownerUserId: schema.assets.ownerUserId })
    .from(schema.assets)
    .where(
      or(
        like(schema.assets.localPath, `%${baseFilename}%`),
        like(schema.assets.url, `%${baseFilename}%`)
      )
    )
    .limit(1)
  if (asset) return asset.ownerUserId

  // 2. SysTask table
  const [task] = await db
    .select({ ownerUserId: schema.sysTask.ownerUserId })
    .from(schema.sysTask)
    .where(
      or(
        like(schema.sysTask.localPath, `%${baseFilename}%`),
        like(schema.sysTask.resultUrl, `%${baseFilename}%`)
      )
    )
    .limit(1)
  if (task) return task.ownerUserId

  // 3. Storyboards table
  const [sb] = await db
    .select({ ownerUserId: schema.dramas.ownerUserId })
    .from(schema.storyboards)
    .innerJoin(schema.episodes, eq(schema.storyboards.episodeId, schema.episodes.id))
    .innerJoin(schema.dramas, eq(schema.episodes.dramaId, schema.dramas.id))
    .where(
      or(
        like(schema.storyboards.composedImage, `%${baseFilename}%`),
        like(schema.storyboards.videoUrl, `%${baseFilename}%`),
        like(schema.storyboards.composedVideoUrl, `%${baseFilename}%`)
      )
    )
    .limit(1)
  if (sb) return sb.ownerUserId

  // 4. VideoMerges table
  const [merge] = await db
    .select({ ownerUserId: schema.dramas.ownerUserId })
    .from(schema.videoMerges)
    .innerJoin(schema.episodes, eq(schema.videoMerges.episodeId, schema.episodes.id))
    .innerJoin(schema.dramas, eq(schema.episodes.dramaId, schema.dramas.id))
    .where(like(schema.videoMerges.mergedUrl, `%${baseFilename}%`))
    .limit(1)
  if (merge) return merge.ownerUserId

  // 5. Characters table
  const [char] = await db
    .select({ ownerUserId: schema.dramas.ownerUserId })
    .from(schema.characters)
    .innerJoin(schema.dramas, eq(schema.characters.dramaId, schema.dramas.id))
    .where(like(schema.characters.imageUrl, `%${baseFilename}%`))
    .limit(1)
  if (char) return char.ownerUserId

  // 6. Scenes table
  const [scene] = await db
    .select({ ownerUserId: schema.dramas.ownerUserId })
    .from(schema.scenes)
    .innerJoin(schema.dramas, eq(schema.scenes.dramaId, schema.dramas.id))
    .where(like(schema.scenes.imageUrl, `%${baseFilename}%`))
    .limit(1)
  if (scene) return scene.ownerUserId

  // 7. Props table
  const [prop] = await db
    .select({ ownerUserId: schema.dramas.ownerUserId })
    .from(schema.props)
    .innerJoin(schema.dramas, eq(schema.props.dramaId, schema.dramas.id))
    .where(like(schema.props.imageUrl, `%${baseFilename}%`))
    .limit(1)
  if (prop) return prop.ownerUserId

  return undefined
}

/**
 * Handles authenticated static media serving with tenant isolation.
 * Replaces anonymous /static/* serving.
 */
export async function handleAuthenticatedMedia(c: Context): Promise<Response> {
  const rawPath = c.req.path.replace(/^\/storyvdo/, '').replace(/^\/static/, '')
  const cleanPath = path.posix.normalize(rawPath).replace(/^\/+/, '')

  // Prevent directory traversal
  if (cleanPath.includes('..') || path.isAbsolute(cleanPath)) {
    return c.text('Forbidden', 403)
  }

  // Check file exists on filesystem within DATA_ROOT/static or DATA_ROOT
  let filePath = path.join(STORAGE_ROOT, cleanPath)
  if (!fs.existsSync(filePath)) {
    filePath = path.join(DATA_ROOT, cleanPath)
  }
  if (!fs.existsSync(filePath)) {
    return c.text('Not Found', 404)
  }

  const stat = fs.statSync(filePath)
  if (!stat.isFile()) {
    return c.text('Not Found', 404)
  }

  // 1. Check if valid provider signed URL
  const sig = c.req.query('sig')
  const exp = c.req.query('exp')
  const isSigned = verifySignedMediaUrl(c.req.path, sig, exp)

  if (!isSigned) {
    const actor = getActor(c)
    const ownerUserId = await resolveMediaOwner(cleanPath)

    if (isServerMode()) {
      // In server mode, require valid authentication
      if (!actor) {
        return c.text('Unauthorized', 401)
      }
      // Must match owner
      if (ownerUserId === undefined || ownerUserId === null || ownerUserId !== actor.userId) {
        return c.text('Not Found', 404)
      }
    } else {
      // In local mode, allow unowned or actor's data; reject cross-tenant if actor exists
      if (actor && ownerUserId !== undefined && ownerUserId !== null && ownerUserId !== actor.userId) {
        return c.text('Not Found', 404)
      }
    }
  }

  // Video files: use videoFileResponse with Range 206 support
  const ext = path.extname(cleanPath).toLowerCase()
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream'

  if (['.mp4', '.mov', '.webm', '.m4v'].includes(ext)) {
    const response = await videoFileResponse(filePath, c.req.header('range'), c.req.method)
    const newHeaders = new Headers(response.headers)
    newHeaders.set('Cache-Control', 'private, max-age=3600')
    return new Response(response.body, {
      status: response.status,
      headers: newHeaders,
    })
  }

  // Non-video files (images, audio)
  const fileBuffer = fs.readFileSync(filePath)
  return new Response(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(fileBuffer.byteLength),
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
