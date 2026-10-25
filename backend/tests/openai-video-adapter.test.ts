import { test } from 'node:test'
import assert from 'node:assert/strict'
import { OpenAIVideoAdapter } from '../src/services/adapters/openai-video.js'
import { getVideoAdapter } from '../src/services/adapters/registry.js'
import { isOfficialProvider } from '../src/services/ai.js'

test('registry returns OpenAIVideoAdapter for openai provider', () => {
  const adapter = getVideoAdapter('openai')
  assert.ok(adapter instanceof OpenAIVideoAdapter)
  assert.equal(adapter.provider, 'openai')
  assert.equal(isOfficialProvider('video', 'openai'), true)
})

test('OpenAIVideoAdapter builds generate request for POST /v1/videos', () => {
  const adapter = new OpenAIVideoAdapter()
  const req = adapter.buildGenerateRequest(
    { provider: 'openai', baseUrl: 'https://www.toraapi.com', apiKey: 'sk-test', model: 'wan3.0-video' },
    {
      id: 1,
      model: 'wan3.0-video',
      prompt: 'A cinematic drone shot of a misty mountain',
      imageUrl: 'https://example.com/start.png',
      aspectRatio: '16:9',
      duration: 5,
    }
  )

  assert.equal(req.url, 'https://www.toraapi.com/v1/videos')
  assert.equal(req.method, 'POST')
  assert.equal(req.headers['Authorization'], 'Bearer sk-test')
  assert.equal(req.headers['Content-Type'], 'application/json')
  assert.equal(req.body.model, 'wan3.0-video')
  assert.equal(req.body.prompt, 'A cinematic drone shot of a misty mountain')
  assert.equal(req.body.image_url, 'https://example.com/start.png')
  assert.equal(req.body.aspect_ratio, '16:9')
  assert.equal(req.body.seconds, 5)
})

test('OpenAIVideoAdapter parses synchronous and asynchronous generate responses', () => {
  const adapter = new OpenAIVideoAdapter()

  // Async task
  const asyncRes = adapter.parseGenerateResponse({ id: 'task-vdo-999', status: 'queued' })
  assert.equal(asyncRes.isAsync, true)
  assert.equal(asyncRes.taskId, 'task-vdo-999')

  // Direct sync response
  const syncRes = adapter.parseGenerateResponse({ id: 'task-vdo-999', video_url: 'https://example.com/final.mp4' })
  assert.equal(syncRes.isAsync, false)
  assert.equal(syncRes.videoUrl, 'https://example.com/final.mp4')
})

test('OpenAIVideoAdapter builds poll request for GET /v1/videos/{taskId}', () => {
  const adapter = new OpenAIVideoAdapter()
  const pollReq = adapter.buildPollRequest(
    { provider: 'openai', baseUrl: 'https://www.toraapi.com', apiKey: 'sk-test', model: 'wan3.0-video' },
    'task-vdo-999'
  )

  assert.equal(pollReq.url, 'https://www.toraapi.com/v1/videos/task-vdo-999')
  assert.equal(pollReq.method, 'GET')
  assert.equal(pollReq.headers['Authorization'], 'Bearer sk-test')
})

test('OpenAIVideoAdapter parses poll responses for pending, completed and failed states', () => {
  const adapter = new OpenAIVideoAdapter()

  // In progress
  const proc = adapter.parsePollResponse({ status: 'processing' })
  assert.equal(proc.status, 'processing')

  // Completed
  const done = adapter.parsePollResponse({
    status: 'completed',
    video_url: 'https://example.com/video.mp4',
    duration: 5,
  })
  assert.equal(done.status, 'completed')
  assert.equal(done.videoUrl, 'https://example.com/video.mp4')
  assert.equal(done.duration, 5)

  // Failed
  const fail = adapter.parsePollResponse({
    status: 'failed',
    error: { message: 'Content moderation blocked' },
  })
  assert.equal(fail.status, 'failed')
  assert.match(fail.error || '', /Content moderation blocked/)
})
