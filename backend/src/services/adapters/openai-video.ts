/**
 * OpenAI / ToraAPI 兼容视频生成 Adapter
 * 官方标准及中转（New-API / One-API / ToraAPI）：
 * - 创建视频任务：POST /v1/videos
 * - 查询视频任务：GET  /v1/videos/{id}
 * - 支持模型：wan3.0-video, wan3.0-video-prime, sora, veo, kling, 等
 */
import type {
  AIConfig,
  ProviderRequest,
  VideoGenerationRecord,
  VideoGenResponse,
  VideoPollResponse,
  VideoProviderAdapter,
} from './types.js'
import { joinProviderUrl } from './url.js'
import { extractDurationFromPrompt } from '../../utils/duration.js'

function parseUrlArray(raw?: string | null): string[] {
  if (!raw) return []
  try {
    const value = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    return value
      .filter((url): url is string => typeof url === 'string')
      .map(url => url.trim())
      .filter(Boolean)
  } catch {
    return [String(raw).trim()].filter(Boolean)
  }
}

export class OpenAIVideoAdapter implements VideoProviderAdapter {
  provider = 'openai'

  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): ProviderRequest {
    const model = (record.model || config.model || 'wan3.0-video').trim()
    const prompt = (record.prompt || '').trim()
    const firstFrame = (record.firstFrameUrl || record.imageUrl || '').trim()
    const lastFrame = (record.lastFrameUrl || '').trim()
    const refImages = parseUrlArray(record.referenceImageUrls)

    const body: Record<string, any> = {
      model,
      prompt,
    }

    const mode = (record.referenceMode || 'reference').trim().toLowerCase()
    const isFirstFrameMode = mode === 'first_frame' && Boolean(firstFrame)

    if (isFirstFrameMode && firstFrame) {
      body.image_url = firstFrame
      body.input_reference = firstFrame
      if (lastFrame) {
        body.last_frame_url = lastFrame
        body.end_image_url = lastFrame
      }
    } else {
      // 严格参考模式：Storyboard 图片作为参考图(Reference)传入，绝不充当 First Frame
      const allRefs = [...refImages]
      if (firstFrame && !allRefs.includes(firstFrame)) {
        allRefs.push(firstFrame)
      }
      if (allRefs.length > 0) {
        body.reference_image_urls = allRefs
      }
    }
    if (record.aspectRatio) {
      body.aspect_ratio = record.aspectRatio
    }
    // 严格从提示词中提取时长（如 9-12s → 12s, 0-5s → 5s），优先于通用默认值
    const promptDuration = extractDurationFromPrompt(prompt)
    const effectiveDuration = promptDuration || record.duration
    if (effectiveDuration) {
      body.seconds = effectiveDuration
      body.duration = effectiveDuration
    }
    if (record.resolution) {
      body.resolution = record.resolution
    }
    if (record.seed !== null && record.seed !== undefined) {
      body.seed = record.seed
    }
    if (record.generateAudio !== null && record.generateAudio !== undefined) {
      body.audio = Boolean(record.generateAudio)
    }

    return {
      url: joinProviderUrl(config.baseUrl, '/v1', '/videos'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body,
    }
  }

  parseGenerateResponse(result: any): VideoGenResponse {
    const videoUrl = this.extractVideoUrl(result)
    if (videoUrl) {
      return {
        isAsync: false,
        videoUrl,
      }
    }

    const taskId = result.id || result.task_id || result.data?.id || result.data?.task_id
    if (taskId) {
      return {
        isAsync: true,
        taskId: String(taskId),
      }
    }

    const err = result.error?.message || result.error || result.message || 'No video URL or task ID returned from video service'
    throw new Error(typeof err === 'string' ? err : JSON.stringify(err))
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(config.baseUrl, '/v1', `/videos/${taskId}`),
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: undefined,
    }
  }

  parsePollResponse(result: any, config?: AIConfig, taskId?: string): VideoPollResponse {
    let videoUrl = this.extractVideoUrl(result)
    const rawStatus = String(result.status || result.task_status || result.state || '').toLowerCase()

    if (['completed', 'succeeded', 'success', 'done'].includes(rawStatus) || videoUrl) {
      if (!videoUrl) {
        const id = result.id || taskId
        if (id && config?.baseUrl) {
          videoUrl = joinProviderUrl(config.baseUrl, '/v1', `/videos/${id}/content`)
        }
      }
      return {
        status: 'completed',
        videoUrl: videoUrl || undefined,
        duration: result.duration || result.seconds,
      }
    }

    if (['failed', 'error', 'cancelled', 'canceled'].includes(rawStatus) || result.error) {
      const error =
        result.error?.message ||
        result.error ||
        result.fail_reason ||
        result.message ||
        'Video generation failed'
      return { status: 'failed', error: typeof error === 'string' ? error : JSON.stringify(error) }
    }

    return { status: 'processing' }
  }

  extractVideoUrl(result: any): string | null {
    if (!result) return null
    return (
      result.video_url ||
      result.url ||
      result.output?.video_url ||
      result.output?.url ||
      result.video?.url ||
      result.result?.video_url ||
      result.result?.url ||
      result.data?.[0]?.url ||
      result.data?.video_url ||
      result.data?.url ||
      null
    )
  }
}
