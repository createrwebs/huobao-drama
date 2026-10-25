/**
 * OpenAI DALL-E 图片生成 Adapter
 * 文生图端点: /v1/images/generations (注意 /v1 前缀)
 * 参考生图端点: /v1/images/edits (multipart/form-data, image[] 文件上传)
 * 响应格式: { data: [{ url: "..." }] } 或 { data: [{ b64_json: "..." }] }
 */
import type {
  ImageProviderAdapter,
  ProviderRequest,
  AIConfig,
  ImageGenerationRecord,
  ImageGenResponse,
  ImagePollResponse,
} from './types'
import { joinProviderUrl } from './url'
import { parseDataUrl } from '../../utils/storage.js'

export class OpenAIImageAdapter implements ImageProviderAdapter {
  provider = 'openai'

  buildGenerateRequest(config: AIConfig, record: ImageGenerationRecord): ProviderRequest {
    const model = record.model || config.model || 'gpt-image-2'
    const isGptImage = model.startsWith('gpt-image-')
    const isGptImage2 = model === 'gpt-image-2'
    const isDalle3 = model.startsWith('dall-e-3')
    const resolvedRes = this.normalizeResolution(record.size)
    const size = isGptImage2
      ? this.normalizeGptImage2Size(resolvedRes)
      : isGptImage
      ? this.normalizeGptImageSize(resolvedRes)
      : isDalle3
      ? this.normalizeDalle3Size(resolvedRes)
      : resolvedRes

    // 有参考图 → 走 edits（multipart 上传图片文件）；无参考图 → 纯文生图 generations
    const refs = this.parseReferenceImages(record.referenceImages)
    if (refs.length) {
      return this.buildEditsRequest(config, model, record.prompt, size, refs)
    }

    const body: any = {
      model,
      prompt: record.prompt,
      size,
      n: 1,
    }

    if (!isGptImage) {
      body.response_format = 'url'
    }

    return {
      url: joinProviderUrl(config.baseUrl, '/v1', '/images/generations'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body,
    }
  }

  private parseReferenceImages(raw?: string | null): string[] {
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
    } catch {
      return []
    }
  }

  /**
   * /v1/images/edits：参考图以 multipart/form-data 的 image[] 文件上传。
   * 参考图在 generation.ts 已归一化为 data URL（本地压缩 / 远程下载），
   * 这里只做 base64 → Blob 的转换；multipart 边界由 fetch 自动设置，不要手填 Content-Type。
   */
  private buildEditsRequest(
    config: AIConfig,
    model: string,
    prompt: string | null | undefined,
    size: string,
    refs: string[],
  ): ProviderRequest {
    const form = new FormData()
    form.append('model', model)
    form.append('prompt', prompt || '')
    form.append('size', size)
    form.append('n', '1')

    let appended = 0
    const fieldName = refs.length === 1 ? 'image' : 'image[]'
    for (const ref of refs) {
      const parsed = parseDataUrl(ref)
      if (!parsed) continue
      const buffer = Buffer.from(parsed.data, 'base64')
      const ext = parsed.mimeType === 'image/png' ? 'png' : parsed.mimeType === 'image/webp' ? 'webp' : 'jpg'
      form.append(fieldName, new Blob([buffer], { type: parsed.mimeType }), `reference-${++appended}.${ext}`)
    }
    if (!appended) {
      throw new Error('参考图片无法解析为可上传的文件（仅支持 data URL 形式的图片）')
    }

    return {
      url: joinProviderUrl(config.baseUrl, '/v1', '/images/edits'),
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: form,
    }
  }

  normalizeResolution(size?: string | null): string {
    if (!size) return '1920x1080'
    const trimmed = size.trim().toLowerCase()

    if (trimmed === '16:9' || trimmed === '16/9') return '1920x1080'
    if (trimmed === '9:16' || trimmed === '9/16') return '1080x1920'
    if (trimmed === '1:1' || trimmed === '1/1') return '1024x1024'
    if (trimmed === '4:3' || trimmed === '4/3') return '1024x768'
    if (trimmed === '3:4' || trimmed === '3/4') return '768x1024'
    if (trimmed === '21:9' || trimmed === '21/9') return '2560x1080'

    if (/^\d+\*\d+$/.test(trimmed)) {
      return trimmed.replace('*', 'x')
    }

    if (/^\d+x\d+$/.test(trimmed)) {
      return trimmed
    }

    if (trimmed.includes(':') || trimmed.includes('/')) {
      const sep = trimmed.includes(':') ? ':' : '/'
      const [w, h] = trimmed.split(sep).map(Number)
      if (w && h) {
        if (w === h) return '1024x1024'
        if (w > h) return `${Math.round((1080 * w) / h)}x1080`
        return `1080x${Math.round((1080 * h) / w)}`
      }
    }

    return '1920x1080'
  }

  private normalizeDalle3Size(size: string): string {
    const [w, h] = size.split('x').map(Number)
    if (!w || !h || w === h) return '1024x1024'
    return w > h ? '1792x1024' : '1024x1792'
  }

  private normalizeGptImageSize(size?: string | null): string {
    const allowed = ['1024x1024', '1536x1024', '1024x1536', 'auto']
    if (!size) return '1024x1024'

    const normalized = size.toLowerCase()
    if (allowed.includes(normalized)) return normalized

    const [width, height] = normalized.split('x').map(Number)
    if (!width || !height) return 'auto'
    if (width === height) return '1024x1024'
    return width > height ? '1536x1024' : '1024x1536'
  }

  private normalizeGptImage2Size(size?: string | null): string {
    if (!size) return '1024x1024'
    const normalized = size.toLowerCase()
    if (normalized === 'auto') return 'auto'

    const [rawWidth, rawHeight] = normalized.split('x').map(Number)
    if (!rawWidth || !rawHeight) return 'auto'

    const width = this.roundToMultiple(Math.min(4096, Math.max(256, rawWidth)), 16)
    const height = this.roundToMultiple(Math.min(4096, Math.max(256, rawHeight)), 16)
    return `${width}x${height}`
  }

  private roundToMultiple(value: number, multiple: number): number {
    return Math.max(multiple, Math.round(value / multiple) * multiple)
  }

  parseGenerateResponse(result: any): ImageGenResponse {
    // 优先检查直接返回的图片 URL 或 Base64（同步完成）
    const imageUrl = result.data?.[0]?.url || result.url || result.output?.url
    if (imageUrl) {
      return { isAsync: false, imageUrl }
    }
    const b64 = result.data?.[0]?.b64_json
    if (b64) {
      return { isAsync: false, imageUrl: undefined }
    }
    // 无直接结果但返回了任务 ID，按异步轮询处理
    if (result.task_id || result.id) {
      return { isAsync: true, taskId: result.task_id || result.id }
    }
    throw new Error('No image URL or task ID in response')
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(config.baseUrl, '/v1', `/images/task/${taskId}`),
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: undefined,
    }
  }

  parsePollResponse(result: any): ImagePollResponse {
    if (result.status === 'completed') {
      return {
        status: 'completed',
        imageUrl: result.image_url || result.data?.[0]?.url || null,
      }
    }
    if (result.status === 'failed') {
      return { status: 'failed', error: result.error?.message || 'Generation failed' }
    }
    return { status: result.status || 'processing' }
  }

  extractImageUrl(result: any): string | null {
    return result.data?.[0]?.url || result.image_url || null
  }

  extractImageBase64(result: any): { data: string; mimeType: string } | null {
    const b64 = result.data?.[0]?.b64_json
    if (b64) {
      return { data: b64, mimeType: 'image/png' }
    }
    return null
  }
}
