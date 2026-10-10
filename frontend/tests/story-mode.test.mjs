import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeTotalSeconds,
  sortStoryboards,
  calculateReadiness,
  resolveFinalVideo,
  formatDuration,
  createAsyncRequestGuard,
  createAsyncEpisodeGuard,
  sanitizeMediaUrl,
  extractGeneratedPrompt,
  extractSafeShotImage,
} from '../app/utils/story-mode.mjs'

test('computeTotalSeconds strictly parses durations and rejects garbage or negative values', () => {
  const storyboards = [
    { id: 1, storyboard_number: 1, duration: 4.5 },
    { id: 2, storyboard_number: 2, duration: 3 },
    { id: 3, storyboard_number: 3, duration: '2.5' },
    { id: 4, storyboard_number: 4, duration: -5 },
    { id: 5, storyboard_number: 5, duration: 'invalid' },
    { id: 6, storyboard_number: 6, duration: '10garbage' }, // must not silently parse to 10
  ]
  const legacyEpisode = { id: 10, duration: 25 } // legacy minutes duration

  const total = computeTotalSeconds(storyboards, legacyEpisode)
  assert.equal(total, 10)
  assert.equal(computeTotalSeconds([]), 0)
  assert.equal(computeTotalSeconds(null), 0)
  assert.equal(computeTotalSeconds(undefined), 0)
})

test('sortStoryboards sorts shots immutably by actual storyboard_number', () => {
  const unordered = [
    { id: 30, storyboard_number: 3, description: 'Shot 3' },
    { id: 10, storyboard_number: 1, description: 'Shot 1' },
    { id: 20, storyboardNumber: 2, description: 'Shot 2' },
    { id: 5, description: 'No number A' },
    { id: 2, description: 'No number B' },
  ]

  const originalCopy = [...unordered]
  const sorted = sortStoryboards(unordered)

  // Verify immutability
  assert.deepEqual(unordered, originalCopy)

  assert.equal(sorted[0].id, 2)
  assert.equal(sorted[1].id, 5)
  assert.equal(sorted[2].id, 10)
  assert.equal(sorted[3].id, 20)
  assert.equal(sorted[4].id, 30)

  assert.deepEqual(sortStoryboards([]), [])
  assert.deepEqual(sortStoryboards(null), [])
  assert.deepEqual(sortStoryboards(undefined), [])
})

test('sanitizeMediaUrl enforces safe URLs and rejects malicious schemes', () => {
  // Valid URLs
  assert.equal(sanitizeMediaUrl('https://example.com/video.mp4'), 'https://example.com/video.mp4')
  assert.equal(sanitizeMediaUrl('http://cdn.org/img.png'), 'http://cdn.org/img.png')
  assert.equal(sanitizeMediaUrl('/static/output/1.mp4'), '/static/output/1.mp4')
  assert.equal(sanitizeMediaUrl('static/merged/5fea83c1-9273-4454-a150-4988dce113df.mp4'), '/static/merged/5fea83c1-9273-4454-a150-4988dce113df.mp4')
  assert.equal(sanitizeMediaUrl('static/uploads/scene.jpg'), '/static/uploads/scene.jpg')
  assert.equal(sanitizeMediaUrl('uploads/scene-1.jpg'), '/static/uploads/scene-1.jpg')
  assert.equal(sanitizeMediaUrl('/uploads/scene-2.jpg'), '/static/uploads/scene-2.jpg')

  // Malicious / Unsafe patterns
  assert.equal(sanitizeMediaUrl('//evil.com/leak.mp4'), null)
  assert.equal(sanitizeMediaUrl('javascript:alert(1)'), null)
  assert.equal(sanitizeMediaUrl('data:text/html,<script>'), null)
  assert.equal(sanitizeMediaUrl('file:///etc/passwd'), null)
  assert.equal(sanitizeMediaUrl('blob:http://evil.com'), null)
  assert.equal(sanitizeMediaUrl('vbscript:msgbox'), null)
  assert.equal(sanitizeMediaUrl('/static/../secret.txt'), null)
  assert.equal(sanitizeMediaUrl('uploads\\hack.png'), null)
  assert.equal(sanitizeMediaUrl('http://'), null)
  assert.equal(sanitizeMediaUrl(''), null)
  assert.equal(sanitizeMediaUrl('   '), null)
  assert.equal(sanitizeMediaUrl(null), null)
  assert.equal(sanitizeMediaUrl(undefined), null)
  assert.equal(sanitizeMediaUrl(12345), null)
})

test('extractGeneratedPrompt falls back correctly when video_prompt is empty or whitespace', () => {
  // Whitespace video_prompt falls back to valid image_prompt
  assert.equal(
    extractGeneratedPrompt({ video_prompt: '   ', image_prompt: 'Close up character' }),
    'Close up character'
  )
  // Empty video_prompt falls back to valid imagePrompt (camelCase)
  assert.equal(
    extractGeneratedPrompt({ videoPrompt: '', imagePrompt: 'Hero standing' }),
    'Hero standing'
  )
  // Non-empty video_prompt is preferred
  assert.equal(
    extractGeneratedPrompt({ video_prompt: 'Cinematic zoom', image_prompt: 'Still shot' }),
    'Cinematic zoom'
  )
  // Description alone must return null
  assert.equal(
    extractGeneratedPrompt({ description: 'Description text only' }),
    null
  )
  assert.equal(extractGeneratedPrompt(null), null)
})

test('extractSafeShotImage falls back when composed_image is empty or unsafe', () => {
  // Empty composed_image falls back to valid first_frame_image
  assert.equal(
    extractSafeShotImage({ composed_image: '', first_frame_image: 'uploads/frame1.jpg' }),
    '/static/uploads/frame1.jpg'
  )
  // Unsafe composed_image falls back to safe first_frame_image
  assert.equal(
    extractSafeShotImage({ composed_image: 'javascript:alert(1)', first_frame_image: 'uploads/frame2.jpg' }),
    '/static/uploads/frame2.jpg'
  )
  // Safe composed_image is selected
  assert.equal(
    extractSafeShotImage({ composed_image: 'uploads/comp.png', first_frame_image: 'uploads/frame3.jpg' }),
    '/static/uploads/comp.png'
  )
  // Both unsafe or missing returns null
  assert.equal(
    extractSafeShotImage({ composed_image: 'data:text/html,bad', first_frame_image: '//evil.com/bad.png' }),
    null
  )
  assert.equal(extractSafeShotImage(null), null)
})

test('calculateReadiness requires generated prompt and safe images with fallbacks', () => {
  const empty = calculateReadiness([])
  assert.equal(empty.total, 0)
  assert.equal(empty.percent, 0)
  assert.equal(empty.isCompleted, false)

  const emptyNull = calculateReadiness(null)
  assert.equal(emptyNull.total, 0)

  const shots = [
    {
      id: 1,
      storyboard_number: 1,
      video_prompt: 'Cinematic wide shot',
      composed_image: '/static/shot1.png',
      video_url: null,
    },
    {
      id: 2,
      storyboard_number: 2,
      video_prompt: '   ', // whitespace only video prompt
      image_prompt: 'Close up character', // valid fallback image prompt
      first_frame_image: 'uploads/frame2.jpg',
      video_url: 'https://example.com/vid2.mp4',
    },
    {
      id: 3,
      storyboard_number: 3,
      description: 'Interior room description only', // description alone must NOT count as withPrompt
      composed_image: 'javascript:alert(1)', // Unsafe, rejected
      video_url: '//evil.com/vid3.mp4', // Unsafe, rejected
    },
    {
      id: 4,
      storyboard_number: 4,
      description: '',
      composed_image: null,
      video_url: null,
    },
  ]

  const stats = calculateReadiness(shots)
  assert.equal(stats.total, 4)
  assert.equal(stats.withPrompt, 2) // only shots 1 and 2 (shot 3 description-only must NOT count)
  assert.equal(stats.withImage, 2) // shots 1 and 2
  assert.equal(stats.withVideo, 1) // shot 2 only
  assert.equal(stats.percent, 25)
  assert.equal(stats.isCompleted, false)

  const allDone = [
    {
      id: 1,
      video_prompt: 'Shot 1 prompt',
      video_url: '/static/v1.mp4',
    },
  ]
  const completeStats = calculateReadiness(allDone)
  assert.equal(completeStats.total, 1)
  assert.equal(completeStats.percent, 100)
  assert.equal(completeStats.isCompleted, true)
})

test('resolveFinalVideo extracts completed video via real merged_url and episode fields', () => {
  const epWithVideo = { id: 1, video_url: '/static/merged-ep1.mp4' }
  assert.equal(resolveFinalVideo(epWithVideo, []), '/static/merged-ep1.mp4')

  const epWithCamelCase = { id: 1, videoUrl: 'https://cdn.example.com/video.mp4' }
  assert.equal(resolveFinalVideo(epWithCamelCase, []), 'https://cdn.example.com/video.mp4')

  const epWithoutVideo = { id: 2, video_url: null }
  const realMerges = [
    { id: 1, status: 'failed', merged_url: '/static/failed.mp4' },
    { id: 2, status: 'processing', merged_url: '/static/processing.mp4' },
    { id: 3, status: 'completed', merged_url: 'uploads/success.mp4' },
  ]
  assert.equal(resolveFinalVideo(epWithoutVideo, realMerges), '/static/uploads/success.mp4')

  const epWithNativeMerged = { id: 3, video_url: 'static/merged/ep3.mp4' }
  assert.equal(resolveFinalVideo(epWithNativeMerged, []), '/static/merged/ep3.mp4')

  const mergesWithNative = [
    { id: 5, status: 'completed', merged_url: 'static/merged/native-final.mp4' },
  ]
  assert.equal(resolveFinalVideo(epWithoutVideo, mergesWithNative), '/static/merged/native-final.mp4')

  // Unsafe merge url ignored
  const unsafeMerges = [
    { id: 4, status: 'completed', merged_url: 'javascript:bad' },
  ]
  assert.equal(resolveFinalVideo(epWithoutVideo, unsafeMerges), null)

  assert.equal(resolveFinalVideo(null, null), null)
})

test('formatDuration formats valid and invalid seconds safely', () => {
  assert.equal(formatDuration(0), '00:00')
  assert.equal(formatDuration(65), '01:05')
  assert.equal(formatDuration(12.4), '00:12')
  assert.equal(formatDuration(-10), '00:00')
  assert.equal(formatDuration('invalid'), '00:00')
  assert.equal(formatDuration(null), '00:00')
})

test('createAsyncRequestGuard tracks request lifecycle, invalidates on route transitions, and rejects stale responses', () => {
  const guard = createAsyncRequestGuard()

  const handle1 = guard.start(101)
  assert.equal(guard.isLatest(handle1), true)

  const handle2 = guard.start(102)
  assert.equal(guard.isLatest(handle1), false)
  assert.equal(guard.isLatest(handle2), true)

  // Explicit invalidation (e.g. invalid ID or drama unmount)
  guard.invalidate()
  assert.equal(guard.isLatest(handle2), false)

  // Invalid ID transition starts null token
  const handleValid = guard.start(103)
  assert.equal(guard.isLatest(handleValid), true)
  const handleInvalid = guard.start(null)
  assert.equal(guard.isLatest(handleValid), false)
  assert.equal(guard.isLatest(handleInvalid), true)

  assert.equal(guard.isLatest(null), false)
  assert.equal(guard.isLatest({ token: 9999 }), false)

  // Alias test
  const epGuard = createAsyncEpisodeGuard()
  const epHandle = epGuard.start(201)
  assert.equal(epGuard.isLatest(epHandle), true)
})
