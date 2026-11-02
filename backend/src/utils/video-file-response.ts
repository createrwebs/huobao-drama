import fs from 'node:fs'

/**
 * Bounded, cancellation-safe file reads without holding a persistent FileHandle across GC cycles.
 * Compatible with Node.js v26+ (prevents ERR_INVALID_STATE on HEAD or unconsumed streams).
 */
export async function videoFileResponse(filePath: string, range?: string, method = 'GET'): Promise<Response> {
  let stat: fs.Stats
  try {
    stat = fs.statSync(filePath)
  } catch {
    return new Response('Video not found', { status: 404 })
  }

  if (!stat.isFile()) {
    return new Response('Video not found', { status: 404 })
  }

  let start = 0
  let end = stat.size - 1

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
    if (!match || (!match[1] && !match[2])) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } })
    }
    if (!match[1]) {
      start = Math.max(0, stat.size - Number(match[2]))
    } else {
      start = Number(match[1])
      if (match[2]) end = Math.min(Number(match[2]), end)
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } })
    }
  }

  const contentLength = Math.max(0, end - start + 1)
  const headers: Record<string, string> = {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Content-Length': String(contentLength),
    ...(range ? { 'Content-Range': `bytes ${start}-${end}/${stat.size}` } : {}),
  }

  if (method.toUpperCase() === 'HEAD' || contentLength === 0) {
    return new Response(null, {
      status: range ? 206 : 200,
      headers,
    })
  }

  let position = start
  let cancelled = false

  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (cancelled) return
      if (position > end) {
        controller.close()
        return
      }
      let fd: number | null = null
      try {
        fd = fs.openSync(filePath, 'r')
        const chunkLen = Math.min(64 * 1024, end - position + 1)
        const buffer = new Uint8Array(chunkLen)
        const bytesRead = fs.readSync(fd, buffer, 0, chunkLen, position)
        fs.closeSync(fd)
        fd = null

        if (cancelled) return
        if (!bytesRead) {
          controller.close()
          return
        }
        position += bytesRead
        controller.enqueue(buffer.subarray(0, bytesRead))
        if (position > end && !cancelled) {
          controller.close()
        }
      } catch (error) {
        if (fd !== null) {
          try { fs.closeSync(fd) } catch {}
        }
        if (!cancelled) controller.error(error)
      }
    },
    cancel() {
      cancelled = true
    },
  })

  return new Response(body, {
    status: range ? 206 : 200,
    headers,
  })
}
