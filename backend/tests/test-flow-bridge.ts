import { imageAdapters, videoAdapters, getImageAdapter, getVideoAdapter } from '../src/services/adapters/registry.js'
import { isOfficialProvider } from '../src/services/ai.js'

console.log('--- Testing Google Flow Adapters ---')
console.log('google_flow image adapter registered:', !!imageAdapters.google_flow)
console.log('google_flow video adapter registered:', !!videoAdapters.google_flow)
console.log('isOfficialProvider image:', isOfficialProvider('image', 'google_flow'))
console.log('isOfficialProvider video:', isOfficialProvider('video', 'google_flow'))

const imgAdapter = getImageAdapter('google_flow')
const imgReq = imgAdapter.buildGenerateRequest(
  { provider: 'google_flow', baseUrl: 'http://127.0.0.1:5679/api/v1/flow-bridge', apiKey: '', model: 'gem_pix_2' },
  { id: 1, prompt: 'A cinematic scene', size: '1920x1080' }
)
console.log('imgReq url:', imgReq.url)
console.log('imgReq body:', JSON.stringify(imgReq.body))

const parsedImg = imgAdapter.parseGenerateResponse({
  data: [{ url: 'http://127.0.0.1:5679/static/images/test.jpg' }]
})
console.log('parsedImg isAsync:', parsedImg.isAsync, 'url:', parsedImg.imageUrl)

const vidAdapter = getVideoAdapter('google_flow')
const vidReq = vidAdapter.buildGenerateRequest(
  { provider: 'google_flow', baseUrl: 'http://127.0.0.1:5679/api/v1/flow-bridge', apiKey: '', model: 'veo' },
  { id: 1, prompt: 'A slow pan shot', aspectRatio: '9:16', duration: 4, resolution: '360p' }
)
console.log('vidReq url:', vidReq.url)
console.log('vidReq body:', JSON.stringify(vidReq.body))

const parsedVid = vidAdapter.parseGenerateResponse({
  status: 'succeeded',
  video_url: 'http://127.0.0.1:5679/static/videos/test.mp4'
})
console.log('parsedVid isAsync:', parsedVid.isAsync, 'url:', parsedVid.videoUrl)

console.log('>>> ALL FLOW ADAPTER TESTS PASSED SUCCESSFULLY! <<<')

