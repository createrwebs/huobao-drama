/**
 * Provider Adapter 注册表
 * 根据 provider 名称返回对应的 Adapter 实例
 */
import { OpenAIImageAdapter } from './openai-image.js'
import { GeminiImageAdapter } from './gemini-image.js'
import { VolcEngineImageAdapter } from './volcengine-image.js'
import { VolcEngineVideoAdapter } from './volcengine-video.js'
import { MiniMaxVideoAdapter } from './minimax-video.js'
import { AliyunWanVideoAdapter } from './aliyun-wan-video.js'
import { GoogleFlowImageAdapter } from './google-flow-image.js'
import { GoogleFlowVideoAdapter } from './google-flow-video.js'
import type { ImageProviderAdapter, VideoProviderAdapter } from './types.js'

// 图片 Adapter 注册表
export const imageAdapters: Record<string, ImageProviderAdapter> = {
  openai: new OpenAIImageAdapter(),
  gemini: new GeminiImageAdapter(),
  volcengine: new VolcEngineImageAdapter(),
  google_flow: new GoogleFlowImageAdapter(),
}

// 视频 Adapter 注册表
export const videoAdapters: Record<string, VideoProviderAdapter> = {
  volcengine: new VolcEngineVideoAdapter(),
  minimax: new MiniMaxVideoAdapter(),
  aliyun: new AliyunWanVideoAdapter(),
  google_flow: new GoogleFlowVideoAdapter(),
}

/**
 * 获取图片 Adapter
 * @param provider 厂商名称
 * @returns 对应的 Adapter
 */
export function getImageAdapter(provider: string): ImageProviderAdapter {
  const adapter = imageAdapters[provider.toLowerCase()]
  if (!adapter) throw new Error(`Unsupported image provider: ${provider}`)
  return adapter
}

/**
 * 获取视频 Adapter
 * @param provider 厂商名称
 * @returns 对应的 Adapter
 */
export function getVideoAdapter(provider: string): VideoProviderAdapter {
  const adapter = videoAdapters[provider.toLowerCase()]
  if (!adapter) throw new Error(`Unsupported video provider: ${provider}`)
  return adapter
}
