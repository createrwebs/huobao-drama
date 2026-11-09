/**
 * 视频海报帧与关键帧提取
 */
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { getAbsolutePath } from './storage.js'
import { ffmpeg, checkFfmpegSuite, ffmpegPath } from './ffmpeg.js'

/** 由视频相对路径推导海报帧路径：static/videos/x.mp4 → static/videos/x_poster.jpg */
export function posterPathFor(relativePath: string): string {
  return relativePath.replace(/\.[^./]+$/, '_poster.jpg')
}

/**
 * 抽取视频 0.5s 处画面作为海报帧（宽 640，等比缩放，与原视频同目录）。
 * 失败返回 null，不阻断主流程。
 */
export async function extractVideoPoster(relativePath: string): Promise<string | null> {
  try {
    // ffmpeg 二进制损坏（跨平台拷贝 node_modules / 下载不完整）时静默跳过，
    // 避免 fluent-ffmpeg 延迟回调里的同步 EFTYPE 崩掉整个进程
    const { ffmpeg: ffmpegOk } = await checkFfmpegSuite()
    if (!ffmpegOk) return null

    const posterRel = posterPathFor(relativePath)
    const posterAbs = getAbsolutePath(posterRel)
    await new Promise<void>((resolve, reject) => {
      ffmpeg(getAbsolutePath(relativePath))
        .screenshots({
          timestamps: ['0.5'],
          filename: path.basename(posterAbs),
          folder: path.dirname(posterAbs),
          size: '640x?',
        })
        .on('end', () => resolve())
        .on('error', reject)
    })
    return posterRel
  } catch (err) {
    console.warn(`[video-poster] 海报帧提取失败 ${relativePath}:`, (err as Error).message)
    return null
  }
}

/**
 * 抽取视频最后一秒画面（倒数 0.5s）作为下一镜头的首帧
 * 保持原视频全分辨率输出，支持连续镜头拼接
 */
export async function extractVideoLastFrame(videoRelativePath: string): Promise<string | null> {
  try {
    const { ffmpeg: ffmpegOk } = await checkFfmpegSuite()
    if (!ffmpegOk) return null

    const videoAbs = getAbsolutePath(videoRelativePath)
    if (!fs.existsSync(videoAbs)) return null

    // 存到 static/keyframes/ 目录
    const basename = path.basename(videoRelativePath).replace(/\.[^./]+$/, '')
    const keyframeRel = `static/keyframes/${basename}_last_frame.jpg`
    const keyframeAbs = getAbsolutePath(keyframeRel)

    const keyframeDir = path.dirname(keyframeAbs)
    if (!fs.existsSync(keyframeDir)) {
      fs.mkdirSync(keyframeDir, { recursive: true })
    }

    // 若已提取过且比视频更新，直接复用
    if (fs.existsSync(keyframeAbs)) {
      const vidMtime = fs.statSync(videoAbs).mtimeMs
      const imgMtime = fs.statSync(keyframeAbs).mtimeMs
      if (imgMtime >= vidMtime) return keyframeRel
    }

    const bin = ffmpegPath || 'ffmpeg'
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(bin, [
        '-y',
        '-sseof', '-0.5',
        '-i', videoAbs,
        '-update', '1',
        '-frames:v', '1',
        '-q:v', '2',
        keyframeAbs,
      ])
      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(keyframeAbs)) resolve()
        else reject(new Error(`ffmpeg exited with code ${code}`))
      })
      proc.on('error', reject)
    })

    return keyframeRel
  } catch (err) {
    console.warn(`[video-poster] ดึงภาพเฟรมท้ายสุดไม่สำเร็จ ${videoRelativePath}:`, (err as Error).message)
    return null
  }
}
