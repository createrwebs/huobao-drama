/**
 * Google Flow Video Adapter (Google Veo via Flow Engine)
 * ส่งคำขอสร้างวิดีโอไปยัง Google Flow Bridge Endpoint
 */
import type {
  VideoProviderAdapter,
  ProviderRequest,
  AIConfig,
  VideoGenerationRecord,
  VideoGenResponse,
  VideoPollResponse,
} from './types'
import { joinProviderUrl } from './url.js'

function parseUrlArray(raw?: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(s => String(s || '').trim()).filter(Boolean) : []
  } catch {
    return [raw.trim()].filter(Boolean)
  }
}

export class GoogleFlowVideoAdapter implements VideoProviderAdapter {
  provider = 'google_flow'

  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): ProviderRequest {
    const baseUrl = config.baseUrl?.trim() || 'http://127.0.0.1:5679/api/v1/flow-bridge'
    const duration = record.duration ? `${record.duration}s` : '4s'
    const quality = record.resolution?.includes('720') ? '720p' : '360p'
    const aspect = record.aspectRatio || '9:16'
    const startImage = record.firstFrameUrl || record.imageUrl || null
    const refImages = parseUrlArray(record.referenceImageUrls)

    return {
      url: joinProviderUrl(baseUrl, '/v1', '/video'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        prompt: record.prompt,
        aspect,
        duration,
        quality,
        start_image: startImage,
        reference_images: refImages,
        storyboard_id: record.storyboardId,
        reference_mode: record.referenceMode,
        model: record.model || config.model,
      },
    }
  }

  parseGenerateResponse(result: any): VideoGenResponse {
    const videoUrl = result.video_url || result.url
    if (videoUrl) {
      return {
        isAsync: false,
        videoUrl,
      }
    }
    throw new Error(result.error?.message || 'Google Flow video generation returned no video URL')
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    const baseUrl = config.baseUrl?.trim() || 'http://127.0.0.1:5679/api/v1/flow-bridge'
    return {
      url: joinProviderUrl(baseUrl, '', '/status'),
      method: 'GET',
      headers: {},
      body: undefined,
    }
  }

  parsePollResponse(result: any): VideoPollResponse {
    return { status: 'completed' }
  }

  extractVideoUrl(result: any): string | null {
    return result.video_url || result.url || null
  }
}
