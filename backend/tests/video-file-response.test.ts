import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { videoFileResponse } from '../src/utils/video-file-response.js'

test('video file serving supports ranges and interrupted previews without stream crashes', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'video-response-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const file = path.join(root, 'fixture.mp4')
  const bytes = Buffer.alloc(256 * 1024, 42)
  fs.writeFileSync(file, bytes)
  const full = await videoFileResponse(file)
  assert.equal(full.status, 200)
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), bytes)
  for (const [range, length] of [['bytes=10-19', 10], ['bytes=-25', 25], ['bytes=262140-', 4]] as const) {
    const res = await videoFileResponse(file, range)
    assert.equal(res.status, 206)
    assert.equal((await res.arrayBuffer()).byteLength, length)
  }
  for (const range of ['bytes=999999-', 'bytes=20-10', 'bytes=-0', 'bytes=a-b', 'bytes=0-1,3-4']) {
    assert.equal((await videoFileResponse(file, range)).status, 416)
  }
  await Promise.all(Array.from({ length: 100 }, async () => {
    const res = await videoFileResponse(file, 'bytes=0-')
    const reader = res.body!.getReader()
    const pending = reader.read()
    await reader.cancel()
    await pending
  }))
  await new Promise(resolve => setTimeout(resolve, 100))
})