import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../src/db/index.js'
import workerRouter, { WORKER_SECRET_KEY } from '../src/routes/worker.js'
import { getR2Config, getR2ObjectUrl, getPresignedR2UploadUrl } from '../src/utils/r2-storage.js'
import { now } from '../src/utils/response.js'

test('Worker & R2: Configuration and Presigned URL generation', async () => {
  const cfg = getR2Config()
  assert.equal(cfg.bucketName, 'vdo')
  assert.ok(cfg.endpoint.includes('r2.cloudflarestorage.com'))
  assert.ok(cfg.accessKeyId.length > 10)

  const url = getR2ObjectUrl('storyvdo/videos/test.mp4')
  assert.ok(url.includes('test.mp4'))

  const presigned = await getPresignedR2UploadUrl('storyvdo/videos/sample.mp4', 'video/mp4', 3600)
  assert.ok(presigned.includes('X-Amz-Signature') || presigned.includes('r2.cloudflarestorage.com'))
})

test('Worker & Colab Lifecycle: Job creation, worker polling, completion, and notebook export', async () => {
  const app = new Hono()
  // Mock actor in context
  app.use('*', async (c, next) => {
    c.set('actor', {
      userId: 1,
      issuer: 'tora',
      externalUserId: 101,
      username: 'test_creator',
      displayName: 'Test Creator',
      sessionId: 1,
      tokenId: 1,
    })
    await next()
  })
  app.route('/api/v1/worker', workerRouter)

  // 1. Setup mock drama and episode and storyboard in DB
  const [drama] = await db
    .insert(schema.dramas)
    .values({
      title: 'Colab Integration Drama',
      ownerUserId: 1,
      createdAt: now(),
      updatedAt: now(),
    })
    .returning()

  const [episode] = await db
    .insert(schema.episodes)
    .values({
      dramaId: drama.id,
      episodeNumber: 1,
      title: 'Episode 1',
      createdAt: now(),
      updatedAt: now(),
    })
    .returning()

  const [sb] = await db
    .insert(schema.storyboards)
    .values({
      episodeId: episode.id,
      storyboardNumber: 1,
      description: 'Warrior drawing sword in bamboo forest',
      videoPrompt: 'Cinematic camera pan around warrior',
      createdAt: now(),
      updatedAt: now(),
    })
    .returning()

  // 2. Test Screenshot creation / registration
  const screenRes = await app.request('/api/v1/worker/screenshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      drama_id: drama.id,
      storyboard_id: sb.id,
      prompt: 'Hero with glowing blade',
      character_reference_url: 'https://example.com/hero.png',
    }),
  })
  assert.equal(screenRes.status, 200)
  const screenJson: any = await screenRes.json()
  assert.ok(screenJson.data)
  const screenshotUrl = screenJson.data.screenshot_url || 'https://example.com/hero.png'

  // 3. Test Colab Job Creation
  const jobRes = await app.request('/api/v1/worker/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      drama_id: drama.id,
      storyboard_id: sb.id,
      prompt: 'Camera zooms in slowly as character turns around',
      screenshot_url: screenshotUrl,
      duration: 5,
      resolution: '720p',
      model: 'wan2.1-i2v',
    }),
  })
  assert.equal(jobRes.status, 200)
  const jobJson: any = await jobRes.json()
  assert.ok(jobJson.data.task_id)
  assert.equal(jobJson.data.status, 'queued')
  assert.ok(jobJson.data.r2_key.includes('.mp4'))
  const taskId = jobJson.data.task_id

  // 4. Test Worker Polling (without token -> 401)
  const unauthPoll = await app.request('/api/v1/worker/jobs/poll')
  assert.equal(unauthPoll.status, 401)

  // 5. Test Worker Polling (with valid token -> gets job)
  const pollRes = await app.request('/api/v1/worker/jobs/poll', {
    headers: { 'X-Worker-Token': WORKER_SECRET_KEY },
  })
  assert.equal(pollRes.status, 200)
  const pollJson: any = await pollRes.json()
  assert.equal(pollJson.data.has_job, true)
  assert.equal(pollJson.data.job.task_id, taskId)
  assert.equal(pollJson.data.job.model, 'wan2.1-i2v')

  // 6. Test Notebook export (.ipynb)
  const nbRes = await app.request(`/api/v1/worker/jobs/${taskId}/notebook`, {
    headers: { 'X-Worker-Token': WORKER_SECRET_KEY },
  })
  assert.equal(nbRes.status, 200)
  const nbText = await nbRes.text()
  const nbData = JSON.parse(nbText)
  assert.equal(nbData.nbformat, 4)
  assert.ok(nbText.includes(`task_id = ${taskId}`))

  // 7. Test Worker Complete callback
  const mockR2VideoUrl = `https://7b45cc55a0d93df72bdfdfe302f2eafd.r2.cloudflarestorage.com/vdo/${jobJson.data.r2_key}`
  const completeRes = await app.request(`/api/v1/worker/jobs/${taskId}/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Worker-Token': WORKER_SECRET_KEY,
    },
    body: JSON.stringify({
      video_url: mockR2VideoUrl,
      duration_seconds: 5,
    }),
  })
  assert.equal(completeRes.status, 200)

  // 8. Verify DB update on storyboard
  const [updatedSb] = await db
    .select()
    .from(schema.storyboards)
    .where(eq(schema.storyboards.id, sb.id))
    .limit(1)

  assert.equal(updatedSb.videoUrl, mockR2VideoUrl)
  assert.equal(updatedSb.duration, 5)

  // 9. Verify task status
  const statusRes = await app.request(`/api/v1/worker/jobs/${taskId}/status`)
  const statusJson: any = await statusRes.json()
  assert.equal(statusJson.data.status, 'completed')
  assert.equal(statusJson.data.video_url, mockR2VideoUrl)
})
