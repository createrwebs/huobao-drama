import { open } from 'node:fs/promises'

/** Bounded, cancellation-safe file reads without Node/Undici stream conversion. */
export async function videoFileResponse(filePath: string, range?: string): Promise<Response> {
  const file = await open(filePath, 'r')
  let closed = false
  const close = async () => {
    if (!closed) { closed = true; await file.close() }
  }
  try {
    const stat = await file.stat()
    if (!stat.isFile()) { await close(); return new Response('Video not found', { status: 404 }) }
    let start = 0, end = stat.size - 1
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
      if (!match || (!match[1] && !match[2])) {
        await close()
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } })
      }
      if (!match[1]) start = Math.max(0, stat.size - Number(match[2]))
      else {
        start = Number(match[1])
        if (match[2]) end = Math.min(Number(match[2]), end)
      }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) {
        await close()
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } })
      }
    }
    let position = start
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          if (cancelled) return
          if (position > end) { await close(); if (!cancelled) controller.close(); return }
          const buffer = new Uint8Array(Math.min(64 * 1024, end - position + 1))
          const { bytesRead } = await file.read(buffer, 0, buffer.length, position)
          if (cancelled) return
          if (!bytesRead) { await close(); if (!cancelled) controller.close(); return }
          position += bytesRead
          controller.enqueue(buffer.subarray(0, bytesRead))
          if (position > end) { await close(); if (!cancelled) controller.close() }
        } catch (error) {
          await close()
          if (!cancelled) controller.error(error)
        }
      },
      async cancel() { cancelled = true; await close() },
    })
    return new Response(body, {
      status: range ? 206 : 200,
      headers: {
        'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes',
        'Content-Length': String(Math.max(0, end - start + 1)),
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${stat.size}` } : {}),
      },
    })
  } catch (error) { await close(); throw error }
}