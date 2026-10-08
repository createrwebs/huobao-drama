import fs from 'fs'
import { db, schema } from '../db/index.js'
import { eq, and, isNull, inArray } from 'drizzle-orm'
import { now } from '../utils/response.js'
import { resolveToLocalFilePath } from './flow-engine.js'
import { getFlowReferenceContext, getCachedFlowReference, referenceFileHash, uploadFlowReference, assertFlowReferenceContext, type FlowReferenceContext } from './flow-reference-upload.js'

export interface FlowCharacterRefItem {
  id: number
  drama_id: number
  name: string
  role?: string | null
  image_url?: string | null
  local_path?: string | null
  absolute_path?: string | null
  is_ready: boolean       // true if character has an image file that exists on disk
  is_synced: boolean      // true if reference has been synced to Flow
  synced_at?: string | null
  flow_account_id?: string | null
  flow_project_id?: string | null
  flow_media_id?: string | null
  ref_tag: string         // e.g. "@ทิน"
}

export interface DramaCharacterRefsSummary {
  drama_id: number
  total_characters: number
  ready_characters: number
  synced_characters: number
  all_synced: boolean
  characters: FlowCharacterRefItem[]
}

function parseReferenceMeta(rawMeta?: string | null): Record<string, any> {
  try {
    const parsed = JSON.parse(rawMeta || '{}')
    if (Array.isArray(parsed)) return { images: parsed }
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return rawMeta ? { legacy_reference_images: rawMeta } : {}
  }
}

function parseFlowRefMeta(rawMeta?: string | null): any {
  return parseReferenceMeta(rawMeta).flow
}

function currentContext(): FlowReferenceContext | null {
  try { return getFlowReferenceContext() } catch { return null }
}

function isReferenceSynced(file: string | null, meta: any, context: FlowReferenceContext | null): boolean {
  if (!file || !fs.existsSync(file) || !meta?.synced || !context) return false
  const hash = referenceFileHash(file)
  const cached = getCachedFlowReference(context, hash)
  return !!(cached && cached.media_id === meta.media_id && meta.file_hash === hash
    && meta.account_id === context.accountId && meta.project_id === context.projectId)
}

/**
 * ดึงรายการตัวละครและสถานะการซิงค์ Reference ของซีรีส์
 */
export async function getDramaCharacterRefs(dramaId: number): Promise<DramaCharacterRefsSummary> {
  const charRows = await db.select().from(schema.characters).where(
    and(
      eq(schema.characters.dramaId, dramaId),
      isNull(schema.characters.deletedAt)
    )
  )

  const context = currentContext()
  const items: FlowCharacterRefItem[] = []

  for (const char of charRows) {
    const rawImg = char.imageUrl || char.localPath
    const absPath = rawImg ? resolveToLocalFilePath(rawImg) : null
    const isReady = !!(absPath && fs.existsSync(absPath))

    const flowMeta = parseFlowRefMeta(char.referenceImages)
    const isSynced = isReady && isReferenceSynced(absPath, flowMeta, context)

    items.push({
      id: char.id,
      drama_id: char.dramaId,
      name: char.name,
      role: char.role || null,
      image_url: char.imageUrl || null,
      local_path: char.localPath || null,
      absolute_path: absPath || null,
      is_ready: isReady,
      is_synced: isSynced,
      synced_at: flowMeta?.synced_at || null,
      flow_account_id: flowMeta?.account_id || null,
      flow_project_id: flowMeta?.project_id || null,
      flow_media_id: flowMeta?.media_id || null,
      ref_tag: `@${char.name.trim()}`,
    })
  }

  const readyChars = items.filter(c => c.is_ready)
  const syncedChars = items.filter(c => c.is_synced)

  return {
    drama_id: dramaId,
    total_characters: items.length,
    ready_characters: readyChars.length,
    synced_characters: syncedChars.length,
    all_synced: items.length > 0 && items.length === syncedChars.length,
    characters: items,
  }
}

/**
 * ส่งรูปตัวละครอ้างอิงไปยัง Google Flow ครั้งเดียว (หรือซิงค์ใหม่เมื่อสั่ง force)
 * ผูกรูป ทิน.jpg กับตัวละครชื่อ ทิน, คง.jpg กับ คง, จัน.jpg กับ จัน
 */
export async function syncDramaCharacterRefsToFlow(
  dramaId: number,
  options?: { force?: boolean; characterIds?: number[] }
): Promise<DramaCharacterRefsSummary> {
  const context = getFlowReferenceContext()
  const charRows = await db.select().from(schema.characters).where(
    and(
      eq(schema.characters.dramaId, dramaId),
      isNull(schema.characters.deletedAt)
    )
  )

  for (const char of charRows) {
    if (options?.characterIds && !options.characterIds.includes(char.id)) {
      continue
    }

    const rawImg = char.imageUrl || char.localPath
    if (!rawImg) {
      if (options?.characterIds) throw new Error(`ตัวละคร "${char.name}" ยังไม่มีภาพอ้างอิง`)
      continue
    }

    const absPath = resolveToLocalFilePath(rawImg)
    if (!absPath || !fs.existsSync(absPath)) throw new Error(`ไม่พบไฟล์รูปตัวละคร "${char.name}"`)
    const uploaded = await uploadFlowReference(absPath, context, !!options?.force)
    assertFlowReferenceContext(context)
    const latest = (await db.select().from(schema.characters).where(eq(schema.characters.id, char.id)))[0]
    if (!latest || latest.deletedAt || (latest.imageUrl || latest.localPath) !== rawImg || referenceFileHash(absPath) !== uploaded.file_hash) {
      throw new Error(`รูปตัวละคร "${char.name}" เปลี่ยนระหว่างซิงค์ กรุณาลองใหม่`)
    }
    await db.update(schema.characters).set({
      referenceImages: JSON.stringify({
        ...parseReferenceMeta(latest.referenceImages),
        flow: { ...uploaded, synced: true, synced_at: new Date().toISOString(), image_url: rawImg, character_name: char.name },
      }),
      updatedAt: now(),
    }).where(eq(schema.characters.id, char.id))
  }

  assertFlowReferenceContext(context)
  return await getDramaCharacterRefs(dramaId)
}

/**
 * ดึงรายการตัวละครอ้างอิงเฉพาะที่ปรากฏในช็อต (Storyboard) นั้นๆ
 */
export async function getStoryboardCharacterRefs(storyboardId: number): Promise<FlowCharacterRefItem[]> {
  const sbCharRows = await db.select({
    characterId: schema.storyboardCharacters.characterId,
  }).from(schema.storyboardCharacters).where(
    eq(schema.storyboardCharacters.storyboardId, storyboardId)
  )

  if (!sbCharRows.length) return []

  const charIds = sbCharRows.map(r => r.characterId)
  const charRows = await db.select().from(schema.characters).where(
    and(
      inArray(schema.characters.id, charIds),
      isNull(schema.characters.deletedAt)
    )
  )

  const context = currentContext()
  const refs: FlowCharacterRefItem[] = []
  for (const char of charRows) {
    const rawImg = char.imageUrl || char.localPath
    const absPath = rawImg ? resolveToLocalFilePath(rawImg) : null
    const isReady = !!(absPath && fs.existsSync(absPath))
    const flowMeta = parseFlowRefMeta(char.referenceImages)

    refs.push({
      id: char.id,
      drama_id: char.dramaId,
      name: char.name,
      role: char.role || null,
      image_url: char.imageUrl || null,
      local_path: char.localPath || null,
      absolute_path: absPath,
      is_ready: isReady,
      is_synced: isReferenceSynced(absPath, flowMeta, context),
      synced_at: flowMeta?.synced_at || null,
      flow_account_id: flowMeta?.account_id || null,
      flow_project_id: flowMeta?.project_id || null,
      flow_media_id: flowMeta?.media_id || null,
      ref_tag: `@${char.name.trim()}`,
    })
  }

  return refs
}

