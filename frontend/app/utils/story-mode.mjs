/**
 * Story Mode projection and calculation helpers (Read-only workspace)
 * Conforms to actual schema fields from backend:
 * - storyboards: storyboard_number, description, image_prompt, video_prompt,
 *                composed_image, first_frame_image, video_url, duration
 * - video_merges: merged_url, status
 */

/**
 * Sanitizes and validates a media URL for safe rendering.
 * Rejects protocol-relative, script/data/file schemes, backslashes, and path traversal.
 */
export function sanitizeMediaUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null
  const trimmed = rawUrl.trim()
  if (!trimmed) return null

  // Reject backslashes and directory traversal
  if (trimmed.includes('\\') || trimmed.includes('..')) return null

  // Reject protocol-relative URLs
  if (trimmed.startsWith('//')) return null

  // Reject dangerous schemes
  if (/^(javascript|data|file|vbscript|blob):/i.test(trimmed)) return null

  // Check absolute URLs
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.href
      }
      return null
    } catch {
      return null
    }
  }

  // Safe local static paths: resolve native static/... and /static/... exactly once
  const clean = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed
  if (clean.startsWith('static/')) {
    return `/${clean}`
  }

  return `/static/${clean}`
}

function parseStrictDuration(raw) {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 ? raw : 0
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    // Strict numeric match: disallows '10garbage' or mixed characters
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      const num = Number(trimmed)
      return Number.isFinite(num) && num > 0 ? num : 0
    }
  }
  return 0
}

export function computeTotalSeconds(storyboards) {
  if (!Array.isArray(storyboards) || storyboards.length === 0) return 0
  const total = storyboards.reduce((sum, shot) => {
    const val = parseStrictDuration(shot?.duration)
    return sum + val
  }, 0)
  return Math.round(total * 10) / 10
}

export function sortStoryboards(storyboards) {
  if (!Array.isArray(storyboards)) return []
  return [...storyboards].sort((a, b) => {
    const numA = Number(a?.storyboard_number ?? a?.storyboardNumber ?? 0)
    const numB = Number(b?.storyboard_number ?? b?.storyboardNumber ?? 0)
    if (numA !== numB) return numA - numB
    return Number(a?.id ?? 0) - Number(b?.id ?? 0)
  })
}

export function extractGeneratedPrompt(shot) {
  const vp = shot?.video_prompt ?? shot?.videoPrompt
  if (typeof vp === 'string' && vp.trim().length > 0) {
    return vp.trim()
  }
  const ip = shot?.image_prompt ?? shot?.imagePrompt
  if (typeof ip === 'string' && ip.trim().length > 0) {
    return ip.trim()
  }
  // Description is NOT counted as a generated prompt
  return null
}

export function extractSafeShotImage(shot) {
  const primary = shot?.composed_image ?? shot?.composedImage
  const safePrimary = sanitizeMediaUrl(primary)
  if (safePrimary) return safePrimary

  const fallback = shot?.first_frame_image ?? shot?.firstFrameImage
  return sanitizeMediaUrl(fallback)
}

export function calculateReadiness(storyboards) {
  if (!Array.isArray(storyboards) || storyboards.length === 0) {
    return {
      total: 0,
      withPrompt: 0,
      withImage: 0,
      withVideo: 0,
      percent: 0,
      isCompleted: false,
    }
  }

  const total = storyboards.length
  let withPrompt = 0
  let withImage = 0
  let withVideo = 0

  for (const shot of storyboards) {
    if (extractGeneratedPrompt(shot)) {
      withPrompt++
    }

    if (extractSafeShotImage(shot)) {
      withImage++
    }

    const vid = shot?.video_url ?? shot?.videoUrl
    if (sanitizeMediaUrl(vid)) {
      withVideo++
    }
  }

  const percent = total > 0 ? Math.round((withVideo / total) * 100) : 0
  const isCompleted = total > 0 && withVideo === total

  return {
    total,
    withPrompt,
    withImage,
    withVideo,
    percent,
    isCompleted,
  }
}

export function resolveFinalVideo(episode, merges) {
  const epVideo = sanitizeMediaUrl(episode?.video_url ?? episode?.videoUrl)
  if (epVideo) return epVideo

  if (Array.isArray(merges)) {
    const completedMerge = merges.find(
      m => m?.status === 'completed' && Boolean(sanitizeMediaUrl(m?.merged_url ?? m?.mergedUrl ?? m?.video_url ?? m?.videoUrl))
    )
    if (completedMerge) {
      return sanitizeMediaUrl(completedMerge.merged_url ?? completedMerge.mergedUrl ?? completedMerge.video_url ?? completedMerge.videoUrl)
    }
  }

  return null
}

export function formatDuration(seconds) {
  const sec = Math.max(0, Math.floor(Number(seconds) || 0))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function createAsyncRequestGuard() {
  let latestToken = 0

  return {
    start(id) {
      latestToken += 1
      const current = latestToken
      return { token: current, id }
    },
    invalidate() {
      latestToken += 1
    },
    isLatest(guardHandle) {
      return Boolean(guardHandle && guardHandle.token === latestToken)
    },
  }
}

export const createAsyncEpisodeGuard = createAsyncRequestGuard
