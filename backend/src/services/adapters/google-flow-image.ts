/**
 * Google Flow Image Adapter (Imagen 3 / gem_pix_2 / narwhal)
 * ส่งคำขอไปยัง Google Flow Bridge Endpoint
 */
import type {
  ImageProviderAdapter,
  ProviderRequest,
  AIConfig,
  ImageGenerationRecord,
  ImageGenResponse,
  ImagePollResponse,
} from './types'
import { joinProviderUrl } from './url.js'

export class GoogleFlowImageAdapter implements ImageProviderAdapter {
  provider = 'google_flow'

  buildGenerateRequest(config: AIConfig, record: ImageGenerationRecord): ProviderRequest {
    const model = record.model || config.model || 'gem_pix_2'
    const baseUrl = config.baseUrl?.trim() || 'http://127.0.0.1:5679/api/v1/flow-bridge'

    return {
      url: joinProviderUrl(baseUrl, '/v1', '/images/generations'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        model,
        prompt: record.prompt,
        size: record.size || '1024x1024',
        n: 1,
      },
    }
  }

  parseGenerateResponse(result: any): ImageGenResponse {
    const imageUrl = result.data?.[0]?.url || result.url
    if (imageUrl) {
      return { isAsync: false, imageUrl }
    }
    throw new Error(result.error?.message || 'Google Flow image generation returned no URL')
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

  parsePollResponse(result: any): ImagePollResponse {
    return { status: 'completed' }
  }

  extractImageUrl(result: any): string | null {
    return result.data?.[0]?.url || result.url || null
  }

  extractImageBase64(_result: any): { data: string; mimeType: string } | null {
    return null
  }
}
