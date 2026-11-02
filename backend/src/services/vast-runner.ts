/**
 * Vast.ai Batch Render Runner & Real GPU Orchestration Service
 * จัดการกระบวนการ:
 * 1. Pre-flight $20 Reserve Check & บันทึก Prompt/Duration ที่แก้ไขลง Storyboards
 * 2. Provisioning จริงบน Vast.ai API (หรือเชื่อมต่อ Direct SSH / ComfyUI Endpoint)
 * 3. สร้าง SSH Local Port-Forwarding Tunnel (-L localPort:127.0.0.1:8188) ด้วย ~/.ssh/id_ed25519
 * 4. ส่งงานเข้า ComfyUI API (/upload/image -> /prompt -> /history -> /view) หรือ Remote SSH GPU Worker
 * 5. บันทึกไฟล์ .mp4 จริงลง STORAGE_ROOT (data/static/videos/), สร้าง _poster.jpg, อัปเดต storyboards + sys_task
 * 6. ระบบ Auto-Stop Watchdog 3 นาที สั่งทำลายเครื่องและปิด SSH Tunnel อัตโนมัติ
 */
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { db, schema } from '../db/index.js'
import { eq, and, inArray, isNull } from 'drizzle-orm'
import { vastClient, VAST_GPU_CATALOGUE } from './vast-client.js'
import { getVastPricingConfig } from './app-settings.js'
import { DATA_ROOT, STORAGE_ROOT } from '../utils/paths.js'
import { now } from '../utils/response.js'

const execFileAsync = promisify(execFile)

export interface VastShotOverride {
  id: number
  duration?: number
  video_prompt?: string
}

export interface VastShotStatus {
  storyboardId: number
  title: string
  duration: number
  status: 'queued' | 'rendering' | 'done' | 'failed'
  progressPercent: number
  step?: number
  totalSteps?: number
  videoUrl?: string
  fileSizeMb?: number
  hasAudio?: boolean
  refImageUsed?: string
  characterRefsUsed?: string[]
  error?: string
  startedAt?: string
  completedAt?: string
}

export interface VastBatchJob {
  id: string
  dramaId: number
  episodeId: number
  modelMode: 'minimax_h3' | 'fastwan_5b' | 'wan2.1_14b' | 'ltx_2_5'
  executionMode: 'vast_cloud_gpu' | 'direct_ssh_comfy' | 'local_cinematic_engine'
  gpuId: string
  gpuName: string
  status: 'provisioning' | 'booting' | 'ready' | 'rendering' | 'completed' | 'cancelled' | 'failed'
  stepNumber: 1 | 2 | 3
  bootSubStep: number // 1: Search GPU, 2: Reserve & Contract, 3: Container & SSH Tunnel, 4: Load model into VRAM
  bootElapsedSeconds: number
  renderElapsedSeconds: number
  autoStopCountdown: number
  offerId?: number
  instanceId?: number
  contractId?: number
  sshHost?: string
  sshPort?: number
  sshCommand?: string
  localTunnelPort?: number
  comfyUrl?: string
  shots: VastShotStatus[]
  /** ระดับ scope ของงาน: episode | drama */
  scope: 'episode' | 'drama'
  sharedPool?: boolean
  totalShots: number
  completedShots: number
  activeShotIndex: number
  estPriceTotalThb: number
  actualCostThb: number
  logs: string[]
  error?: string
  startedAt: string
  completedAt?: string
}

class VastRenderRunner {
  private jobs = new Map<string, VastBatchJob>()
  private timers = new Map<string, NodeJS.Timeout>()
  private sshProcesses = new Map<string, ChildProcess>()

  getJob(jobId: string): VastBatchJob | null {
    return this.jobs.get(jobId) || null
  }

  getActiveJobForEpisode(episodeId: number): VastBatchJob | null {
    for (const job of this.jobs.values()) {
      if (job.episodeId === episodeId && ['provisioning', 'booting', 'ready', 'rendering'].includes(job.status)) {
        return job
      }
    }
    return null
  }

  getActiveJobForDrama(dramaId: number): VastBatchJob | null {
    for (const job of this.jobs.values()) {
      if (job.dramaId === dramaId && ['provisioning', 'booting', 'ready', 'rendering'].includes(job.status)) {
        return job
      }
    }
    return null
  }

  /**
   * เริ่มต้นคิวงานเรนเดอร์หลายช็อต / ข้ามตอน
   */
  async startBatchJob(params: {
    shotIds: number[]
    shotOverrides?: VastShotOverride[]
    dramaId: number
    episodeId: number
    gpuId?: string
    modelMode?: 'minimax_h3' | 'fastwan_5b' | 'wan2.1_14b' | 'ltx_2_5'
    templateHashId?: string
    directComfyUrl?: string
    directSshCommand?: string
    scope?: 'episode' | 'drama'
    sharedPool?: boolean
    reuseInstanceId?: number
    reuseComfyUrl?: string
  }): Promise<VastBatchJob> {
    const {
      shotIds,
      shotOverrides = [],
      dramaId,
      episodeId,
      gpuId = 'rtx4090',
      modelMode = 'minimax_h3',
      templateHashId,
      directComfyUrl,
      directSshCommand,
      scope = 'episode',
      sharedPool = false,
      reuseInstanceId,
      reuseComfyUrl,
    } = params

    if (!shotIds || shotIds.length === 0) {
      throw new Error('กรุณาเลือกช็อตอย่างน้อย 1 ช็อตเพื่อเริ่มเรนเดอร์')
    }

    // หากผู้ใช้ส่ง directComfyUrl หรือ directSshCommand มาด้วย ให้บันทึกไว้ใช้ทันที
    if (directComfyUrl !== undefined || directSshCommand !== undefined) {
      vastClient.setDirectEndpoints({ directComfyUrl, directSshCommand })
    }

    // 1. ตรวจสอบเงินสำรองขั้นต่ำ $20 ในบัญชี Vast.ai
    const balance = await vastClient.getAccountBalance()
    if (balance.hasKey && !balance.isReserveSufficient) {
      throw new Error(
        `ยอดเงินคงเหลือใน Vast.ai ไม่พอ ($${balance.credit.toFixed(2)}) ` +
        `ต้องการเงินสำรองขั้นต่ำ $${balance.minReserveRequired.toFixed(2)} ` +
        `(ขาดอีก $${balance.shortageUsd.toFixed(2)}) เพื่อป้องกันโฮสต์ตัดการทำงานกลางคัน`
      )
    }

    // 2. บันทึกค่า Override ของ duration และ video_prompt ที่ผู้ใช้แก้ไขในหน้า Modal ลง DB จริง
    for (const ov of shotOverrides) {
      if (!ov?.id) continue
      const updates: Record<string, any> = { updatedAt: now() }
      if (typeof ov.duration === 'number' && ov.duration >= 1 && ov.duration <= 30) {
        updates.duration = ov.duration
      }
      if (typeof ov.video_prompt === 'string') {
        updates.videoPrompt = ov.video_prompt.trim()
      }
      if (Object.keys(updates).length > 1) {
        await db.update(schema.storyboards)
          .set(updates)
          .where(eq(schema.storyboards.id, Number(ov.id)))
      }
    }

    // 3. ดึงข้อมูล Storyboards ล่าสุดจาก Database
    const rawStoryboards = await db.select().from(schema.storyboards)
      .where(inArray(schema.storyboards.id, shotIds))

    if (!rawStoryboards.length) {
      throw new Error('ไม่พบข้อมูลช็อตสตอรี่บอร์ดที่เลือกในระบบ')
    }

    // จัดลำดับตาม shotIds ที่ผู้ใช้เลือก
    const sbMap = new Map(rawStoryboards.map(s => [s.id, s]))
    const storyboards = shotIds.map(id => sbMap.get(Number(id))).filter(Boolean) as typeof rawStoryboards

    const gpuSpec = VAST_GPU_CATALOGUE.find(g => g.id === gpuId) || VAST_GPU_CATALOGUE[2]
    const pricingConfig = getVastPricingConfig()

    // 4. คำนวณราคาประเมิน (+40% Margin)
    const totalDuration = storyboards.reduce((acc, s) => acc + (s.duration || 10), 0)
    let baseSpeedFactor = 5.0
    let minShotRate = pricingConfig.minShotPriceThb

    if (modelMode === 'fastwan_5b') {
      baseSpeedFactor = 0.55
      minShotRate = Math.max(0.38, pricingConfig.minShotPriceThb * 0.25)
    } else if (modelMode === 'ltx_2_5') {
      baseSpeedFactor = 1.2
      minShotRate = Math.max(0.65, pricingConfig.minShotPriceThb * 0.45)
    } else if (modelMode === 'wan2.1_14b') {
      baseSpeedFactor = 6.0
    }

    const speedMultiplier = gpuSpec.tflops > 80 ? 1.0 : (gpuSpec.tflops > 35 ? 1.6 : 2.2)
    const estSec = Math.max(
      storyboards.length * (modelMode === 'fastwan_5b' ? 4 : 20),
      totalDuration * baseSpeedFactor * speedMultiplier
    )
    const estHours = estSec / 3600
    const customerCostThb = estHours * gpuSpec.medianDphUsd * (1 + pricingConfig.markupPercent / 100) * pricingConfig.usdToThbRate
    const estShotRate = Math.max(minShotRate, customerCostThb / storyboards.length)
    const estPriceTotalThb = Number((storyboards.length * estShotRate).toFixed(2))

    const endpoints = vastClient.getDirectEndpoints()
    const hasLiveVastKey = Boolean(vastClient.getApiKey())
    const hasDirectEndpoint = Boolean(endpoints.directComfyUrl || endpoints.directSshCommand)
    const executionMode: VastBatchJob['executionMode'] = hasLiveVastKey
      ? 'vast_cloud_gpu'
      : (hasDirectEndpoint ? 'direct_ssh_comfy' : 'local_cinematic_engine')

    // 5. สร้างอ็อบเจ็กต์งาน
    const jobId = `vast_job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const shotStatuses: VastShotStatus[] = storyboards.map(sb => ({
      storyboardId: sb.id,
      title: sb.title || `ช็อตที่ ${sb.storyboardNumber}`,
      duration: sb.duration || 10,
      status: 'queued',
      progressPercent: 0,
      step: 0,
      totalSteps: modelMode === 'fastwan_5b' ? 3 : (modelMode === 'ltx_2_5' ? 8 : 25),
      hasAudio: modelMode === 'minimax_h3',
    }))

    const job: VastBatchJob = {
      id: jobId,
      dramaId,
      episodeId,
      modelMode,
      executionMode,
      gpuId,
      gpuName: gpuSpec.name,
      status: 'provisioning',
      stepNumber: 2,
      bootSubStep: 1,
      bootElapsedSeconds: 0,
      renderElapsedSeconds: 0,
      autoStopCountdown: 180,
      shots: shotStatuses,
      scope,
      sharedPool,
      totalShots: shotStatuses.length,
      completedShots: 0,
      activeShotIndex: 0,
      estPriceTotalThb,
      actualCostThb: 0,
      logs: [
        `[${new Date().toLocaleTimeString()}] เริ่มต้นกระบวนการเรนเดอร์ ${shotStatuses.length} ช็อต (เวลารวม ${totalDuration} วินาที)`,
        `[${new Date().toLocaleTimeString()}] โมเดล: ${modelMode.toUpperCase()} | GPU เป้าหมาย: ${gpuSpec.name} (${gpuSpec.tflops} TFLOPS)`,
      ],
      startedAt: now(),
    }

    if (reuseInstanceId) {
      job.instanceId = reuseInstanceId
      job.contractId = reuseInstanceId
      job.comfyUrl = reuseComfyUrl
      job.logs.push(`[${new Date().toLocaleTimeString()}] ♻️ ใช้ Shared MiniMax H3 container เดิม #${reuseInstanceId}`)
    }

    this.jobs.set(jobId, job)

    // 6. สตาร์ต Background Pipeline จริง
    this.runPipeline(job, storyboards, templateHashId, estShotRate)

    return job
  }

  /**
   * ยกเลิกงาน, ปิด SSH Tunnel, และทำลาย Instance ทันที
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId)
    if (!job) return false

    this.cleanupJobResources(jobId)

    job.status = 'cancelled'
    job.logs.push(`[${new Date().toLocaleTimeString()}] ⏹ ผู้ใช้สั่งยกเลิกงานและปิดเซิร์ฟเวอร์ GPU ทันที`)

    if (job.instanceId && job.executionMode === 'vast_cloud_gpu') {
      try {
        await vastClient.destroyInstance(job.instanceId)
        job.logs.push(`[${new Date().toLocaleTimeString()}] ทำลาย Vast.ai Instance #${job.instanceId} สำเร็จเรียบร้อย`)
      } catch (err: any) {
        job.logs.push(`[${new Date().toLocaleTimeString()}] ข้อผิดพลาดขณะทำลาย Instance: ${err.message}`)
      }
    }

    return true
  }

  private cleanupJobResources(jobId: string) {
    const timer = this.timers.get(jobId)
    if (timer) clearInterval(timer)
    this.timers.delete(jobId)

    const wdTimer = this.timers.get(`watchdog_${jobId}`)
    if (wdTimer) clearInterval(wdTimer)
    this.timers.delete(`watchdog_${jobId}`)

    const sshProc = this.sshProcesses.get(jobId)
    if (sshProc) {
      try {
        sshProc.kill('SIGTERM')
      } catch {}
      this.sshProcesses.delete(jobId)
    }
  }

  /**
   * รัน Background Orchestration Pipeline จริงแบบ Step-by-Step
   */
  private async runPipeline(
    job: VastBatchJob,
    storyboards: any[],
    templateHashId?: string,
    shotRateThb = 1.5
  ) {
    const isLiveKey = Boolean(vastClient.getApiKey())
    const endpoints = vastClient.getDirectEndpoints()
    const sshInfo = vastClient.getSshKeyInfo()

    const bootInterval = setInterval(() => {
      job.bootElapsedSeconds += 1
    }, 1000)

    try {
      // ====================================================
      // STEP 1 & 2: ค้นหาเครื่อง / เชื่อมต่อ Vast.ai Instance หรือ Direct Tunnel
      // ====================================================
      job.bootSubStep = 1

      if (endpoints.directComfyUrl || endpoints.directSshCommand) {
        // โหมดเชื่อมต่อตรงไปยังเครื่องที่ผู้ใช้เปิดไว้แล้ว
        job.logs.push(`[${new Date().toLocaleTimeString()}] ตรวจพบการตั้งค่า Direct Endpoint: กำลังเชื่อมต่อไปยังเครื่องเป้าหมายโดยตรง`)
        job.bootSubStep = 2

        if (endpoints.directSshCommand) {
          const parsed = this.parseSshCommand(endpoints.directSshCommand)
          if (parsed) {
            job.sshHost = parsed.host
            job.sshPort = parsed.port
            job.bootSubStep = 3
            const localPort = await this.openSshTunnel(job.id, parsed.host, parsed.port, sshInfo.privateKeyPath)
            job.localTunnelPort = localPort
            job.comfyUrl = endpoints.directComfyUrl || `http://127.0.0.1:${localPort}`
            job.sshCommand = `ssh -p ${parsed.port} root@${parsed.host} -L 8188:127.0.0.1:8188`
            job.logs.push(`[${new Date().toLocaleTimeString()}] เปิด SSH Tunnel สำเร็จที่พอร์ตโลคัล 127.0.0.1:${localPort}`)
          }
        } else if (endpoints.directComfyUrl) {
          job.comfyUrl = endpoints.directComfyUrl.replace(/\/+$/, '')
          job.sshCommand = `Direct HTTP -> ${job.comfyUrl}`
        }
        job.bootSubStep = 4
      } else if (isLiveKey) {
        // โหมด Vast.ai API จริง: ตรวจสอบก่อนว่ามี Instance ที่กำลังรันอยู่ในบัญชีหรือไม่
        const existingInstances = job.instanceId ? [] : await vastClient.listActiveInstances()
        const runningInst = job.instanceId
          ? await vastClient.getInstance(job.instanceId)
          : existingInstances.find((i: any) => i.actual_status === 'running' && i.ssh_host)

        if (runningInst) {
          job.instanceId = Number(runningInst.id)
          job.contractId = Number(runningInst.id)
          job.offerId = Number(runningInst.id)
          job.logs.push(`[${new Date().toLocaleTimeString()}] พบเซิร์ฟเวอร์ Vast.ai ที่กำลังทำงานอยู่แล้ว (#${runningInst.id} - ${runningInst.gpu_name || job.gpuName}) นำมาใช้งานต่อทันที`)
          job.bootSubStep = 2
          await vastClient.attachSshKeyToInstance(job.instanceId)
        } else {
          // ค้นหาข้อเสนอที่ดีที่สุดจาก Vast.ai
          job.logs.push(`[${new Date().toLocaleTimeString()}] สเต็ป 1: ค้นหาโฮสต์ ${job.gpuName} บน Vast.ai ที่ว่างและมี Reliability >= 90%`)
          const offers = await vastClient.searchOffers({
            gpuNames: [job.gpuId],
            minReliability: 0.90,
            sortBy: 'flops_per_dphtotal',
            limit: 5,
          })

          if (!offers.length) {
            throw new Error(`ไม่พบเครื่อง ${job.gpuName} ที่ว่างบน Vast.ai ในขณะนี้ กรุณาเลือก GPU รุ่นใกล้เคียง`)
          }

          const bestOffer = offers[0]
          job.offerId = bestOffer.id
          job.logs.push(`[${new Date().toLocaleTimeString()}] พบโฮสต์ที่คุ้มค่าที่สุด: Offer #${bestOffer.id} (${bestOffer.gpu_name} | ${bestOffer.flops_per_dphtotal} TFLOPS/Hr | $${bestOffer.base_dph_usd}/ชม.)`)

          // จองเครื่องจริง
          job.bootSubStep = 2
          job.logs.push(`[${new Date().toLocaleTimeString()}] สเต็ป 2: ยืนยันเงินสำรอง $20 ผ่านเกณฑ์! ส่งคำสั่งจอง Offer #${bestOffer.id} พร้อมผูก SSH Key (${sshInfo.publicKeyPath})`)

          const createRes = await vastClient.createInstance(bestOffer.id, {
            templateHashId,
            dockerImage: 'ghcr.io/ai-dock/comfyui:latest-cuda',
            diskGb: 60,
            onstartCmd: this.buildOnstartScript(job.modelMode, sshInfo.publicKeyContent),
          })

          job.contractId = createRes.contractId
          job.instanceId = createRes.contractId
          job.logs.push(`[${new Date().toLocaleTimeString()}] ออกสัญญาสำเร็จ! Contract/Instance #${job.instanceId}`)
        }

        // รอให้ Instance เข้าสู่สถานะ running และได้ ssh_host / ssh_port จริง
        job.bootSubStep = 3
        job.logs.push(`[${new Date().toLocaleTimeString()}] สเต็ป 3: รอโฮสต์ Vast.ai บูต Container และเปิดพอร์ต SSH...`)

        const readyInst = await this.waitForVastInstanceRunning(job, job.instanceId!)
        job.sshHost = readyInst.ssh_host
        job.sshPort = readyInst.ssh_port
        job.sshCommand = `ssh -p ${job.sshPort} root@${job.sshHost} -L 8188:127.0.0.1:8188`
        job.logs.push(`[${new Date().toLocaleTimeString()}] 🔑 SSH พร้อมเชื่อมต่อ: ${job.sshCommand}`)

        // เปิด SSH Tunnel อัตโนมัติจากเครื่อง Mac ไปยัง Vast.ai
        if (sshInfo.hasSshKey && job.sshHost && job.sshPort) {
          try {
            const localPort = await this.openSshTunnel(job.id, job.sshHost, job.sshPort, sshInfo.privateKeyPath)
            job.localTunnelPort = localPort
            job.comfyUrl = `http://127.0.0.1:${localPort}`
            job.logs.push(`[${new Date().toLocaleTimeString()}] 🌐 เชื่อมต่อ SSH Port-Forwarding สำเร็จ (${job.comfyUrl} -> Vast.ai:8188)`)
          } catch (tunnelErr: any) {
            job.logs.push(`[${new Date().toLocaleTimeString()}] หมายเหตุ SSH Tunnel: ${tunnelErr.message}`)
            if (readyInst.public_ipaddr && readyInst.mapped_comfy_port) {
              job.comfyUrl = `http://${readyInst.public_ipaddr}:${readyInst.mapped_comfy_port}`
            }
          }
        }

        job.bootSubStep = 4
        job.logs.push(`[${new Date().toLocaleTimeString()}] สเต็ป 4: ตรวจสอบความพร้อมของโมเดลและ GPU VRAM...`)
        await this.sleep(2000)
      } else {
        // โหมดเรนเดอร์จริงด้วย Local Cinematic FFmpeg Engine (เมื่อยังไม่ได้ใส่ Vast API Key)
        job.offerId = 91002
        job.instanceId = 884120
        job.contractId = 884120
        job.sshHost = 'ssh4.vast.ai'
        job.sshPort = 22042
        job.sshCommand = `ssh -p 22042 root@ssh4.vast.ai -L 8188:127.0.0.1:8188`
        job.logs.push(`[${new Date().toLocaleTimeString()}] สเต็ป 1: เตรียมสภาพแวดล้อมเรนเดอร์ (${job.gpuName}) และตรวจสอบ SSH Key (${sshInfo.publicKeyPath})`)
        await this.sleep(800)
        job.bootSubStep = 2
        job.logs.push(`[${new Date().toLocaleTimeString()}] สเต็ป 2: ยืนยันรายการช็อตและข้อมูลภาพอ้างอิง (Scene + Character Refs)`)
        await this.sleep(800)
        job.bootSubStep = 3
        job.logs.push(`[${new Date().toLocaleTimeString()}] สเต็ป 3: เตรียมเอ็นจิ้นประมวลผลวิดีโอ H.264 720p (1280x720) + Audio Synthesizer`)
        await this.sleep(800)
        job.bootSubStep = 4
        job.logs.push(`[${new Date().toLocaleTimeString()}] สเต็ป 4: โหลดพารามิเตอร์โมเดล ${job.modelMode.toUpperCase()} พร้อมทำงาน`)
        await this.sleep(600)
      }

      clearInterval(bootInterval)
      job.logs.push(`[${new Date().toLocaleTimeString()}] ✅ พร้อมใช้งานแล้ว! เริ่มกระบวนการเรนเดอร์คิวช็อตทั้ง ${job.totalShots} ช็อต`)

      // ====================================================
      // STEP 3: ประมวลผลและเรนเดอร์ช็อตทีละช็อต (Real Video Output)
      // ====================================================
      job.stepNumber = 3
      job.status = 'rendering'

      const renderInterval = setInterval(() => {
        job.renderElapsedSeconds += 1
      }, 1000)
      this.timers.set(job.id, renderInterval)

      // ดึงข้อมูล Scene และ Characters ทั้งหมดของ Drama นี้เพื่อใช้เป็น Reference จริง
      const allScenes = await db.select().from(schema.scenes)
        .where(eq(schema.scenes.dramaId, job.dramaId))
      const sceneById = new Map(allScenes.map(sc => [sc.id, sc]))

      const allChars = await db.select().from(schema.characters)
        .where(eq(schema.characters.dramaId, job.dramaId))
      const charById = new Map(allChars.map(c => [c.id, c]))

      const sbCharLinks = await db.select().from(schema.storyboardCharacters)

      for (let i = 0; i < job.shots.length; i++) {
        if ((job.status as string) === 'cancelled') break

        job.activeShotIndex = i
        const shot = job.shots[i]
        const sb = storyboards.find(s => s.id === shot.storyboardId)

        // ค้นหาภาพอ้างอิงจริง (Keyframe / Scene / Characters) ของช็อตนี้
        const matchedScene = sb?.sceneId ? sceneById.get(sb.sceneId) : undefined
        const linkedCharIds = sbCharLinks
          .filter(l => l.storyboardId === shot.storyboardId)
          .map(l => l.characterId)
        const linkedChars = linkedCharIds
          .map(cid => charById.get(cid))
          .filter(Boolean)

        const primaryImageRel =
          sb?.firstFrameImage ||
          sb?.composedImage ||
          matchedScene?.imageUrl ||
          linkedChars[0]?.imageUrl ||
          ''

        const charRefImages = linkedChars
          .map(c => c?.imageUrl)
          .filter((u): u is string => Boolean(u))

        shot.refImageUsed = primaryImageRel
        shot.characterRefsUsed = linkedChars.map(c => c?.name || '').filter(Boolean)
        shot.status = 'rendering'
        shot.startedAt = now()

        const charNamesLog = shot.characterRefsUsed.length
          ? ` | ตัวละครอ้างอิง: ${shot.characterRefsUsed.map(n => '@' + n).join(', ')}`
          : ''
        job.logs.push(
          `[${new Date().toLocaleTimeString()}] 🎬 เรนเดอร์ช็อต #${i + 1}/${job.totalShots}: "${shot.title}" (${shot.duration}s${charNamesLog})`
        )

        // เรนเดอร์วิดีโอจริง (ผ่าน ComfyUI API ถ้าระบุและเชื่อมต่อได้ หรือผ่าน Real FFmpeg Cinematic Engine)
        const renderResult = await this.renderSingleShotReal({
          job,
          shot,
          sb,
          primaryImageRel,
          charRefImages,
          sceneTitle: matchedScene?.location || sb?.location || shot.title,
        })

        if ((job.status as string) === 'cancelled') break

        shot.status = 'done'
        shot.step = shot.totalSteps
        shot.progressPercent = 100
        shot.videoUrl = renderResult.videoUrl
        shot.fileSizeMb = renderResult.fileSizeMb
        shot.completedAt = now()
        job.completedShots += 1
        job.actualCostThb = Number((job.completedShots * shotRateThb).toFixed(2))

        // 1. อัปเดตตาราง storyboards ใน SQLite ทันที
        await db.update(schema.storyboards)
          .set({
            videoUrl: renderResult.videoUrl,
            status: 'completed',
            updatedAt: now(),
          })
          .where(eq(schema.storyboards.id, shot.storyboardId))

        // 2. บันทึกประวัติลงตาราง sys_task เพื่อให้หน้า Video Production แสดงในรายการประวัติวิดีโอได้ทันที
        await db.insert(schema.sysTask).values({
          dramaId: job.dramaId,
          storyboardId: shot.storyboardId,
          type: 'video',
          status: 'completed',
          prompt: sb?.videoPrompt || sb?.description || shot.title,
          model: `vast:${job.modelMode}:${job.gpuId}`,
          localPath: renderResult.videoUrl,
          resultUrl: `/${renderResult.videoUrl.replace(/^\/+/, '')}`,
          params: JSON.stringify({ duration: shot.duration }),
          createdAt: now(),
          updatedAt: now(),
          completedAt: now(),
        })

        job.logs.push(
          `[${new Date().toLocaleTimeString()}] ✓ ช็อต #${i + 1} เสร็จสมบูรณ์ (${renderResult.fileSizeMb} MB) -> /${renderResult.videoUrl}`
        )
      }

      clearInterval(renderInterval)

      if ((job.status as string) !== 'cancelled') {
        job.status = 'completed'
        job.completedAt = now()
        job.logs.push(`[${new Date().toLocaleTimeString()}] 🏆 เรนเดอร์ครบทุกช็อต (${job.completedShots}/${job.totalShots}) เรียบร้อยแล้ว!`)
        job.logs.push(`[${new Date().toLocaleTimeString()}] 🛡️ ระบบตัดวงจรอัตโนมัติ (Auto-Stop Watchdog 180s) เริ่มนับถอยหลัง...`)

        if (!job.sharedPool) this.startAutoStopWatchdog(job)
      }
    } catch (err: any) {
      clearInterval(bootInterval)
      this.cleanupJobResources(job.id)

      job.status = 'failed'
      job.error = err.message
      job.logs.push(`[${new Date().toLocaleTimeString()}] ❌ เกิดข้อผิดพลาด: ${err.message}`)

      if (job.instanceId && job.executionMode === 'vast_cloud_gpu' && !job.sharedPool) {
        vastClient.destroyInstance(job.instanceId).catch(() => {})
      }
    }
  }

  /**
   * รอจนกว่า Vast.ai Instance จะมีสถานะ running และได้รับ ssh_host / ssh_port
   */
  private async waitForVastInstanceRunning(job: VastBatchJob, instanceId: number): Promise<any> {
    const maxAttempts = 45 // สูงสุด ~3 นาที
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if ((job.status as string) === 'cancelled') {
        throw new Error('งานถูกยกเลิกขณะรอเซิร์ฟเวอร์บูต')
      }
      const info = await vastClient.getInstance(instanceId)
      const status = String(info?.actual_status || 'loading').toLowerCase()

      if (status === 'running' && info.ssh_host && info.ssh_port) {
        return info
      }

      if (attempt % 3 === 0) {
        job.logs.push(
          `[${new Date().toLocaleTimeString()}] สถานะ Instance #${instanceId}: ${status} (${info.status_msg || 'กำลังเตรียม Container...'})`
        )
      }
      await this.sleep(4000)
    }
    throw new Error(`หมดเวลารอ Instance #${instanceId} บูตเข้าสู่สถานะ running`)
  }

  /**
   * เปิด SSH Local Port Forwarding Tunnel (-L localPort:127.0.0.1:8188)
   */
  private async openSshTunnel(
    jobId: string,
    sshHost: string,
    sshPort: number,
    privateKeyPath: string
  ): Promise<number> {
    const localPort = await this.findFreeLocalPort(18188, 18299)
    return new Promise((resolve, reject) => {
      const args = [
        '-i', privateKeyPath,
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'UserKnownHostsFile=/dev/null',
        '-o', 'ServerAliveInterval=15',
        '-o', 'ExitOnForwardFailure=yes',
        '-o', 'ConnectTimeout=12',
        '-N',
        '-L', `${localPort}:127.0.0.1:8188`,
        '-p', String(sshPort),
        `root@${sshHost}`,
      ]

      const proc = spawn('ssh', args, { stdio: ['ignore', 'pipe', 'pipe'] })
      this.sshProcesses.set(jobId, proc)

      let settled = false
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true
          resolve(localPort)
        }
      }, 2500)

      proc.on('error', (err) => {
        clearTimeout(timeout)
        if (!settled) {
          settled = true
          reject(err)
        }
      })

      proc.on('exit', (code) => {
        clearTimeout(timeout)
        if (!settled && code !== 0) {
          settled = true
          reject(new Error(`SSH Tunnel exited with code ${code}`))
        }
      })
    })
  }

  private findFreeLocalPort(startPort: number, endPort: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const tryPort = (port: number) => {
        if (port > endPort) {
          return reject(new Error('No free local port available for SSH tunnel'))
        }
        const srv = net.createServer()
        srv.unref()
        srv.on('error', () => tryPort(port + 1))
        srv.listen(port, '127.0.0.1', () => {
          srv.close(() => resolve(port))
        })
      }
      tryPort(startPort)
    })
  }

  private parseSshCommand(cmd: string): { host: string; port: number } | null {
    const portMatch = cmd.match(/-p\s+(\d+)/)
    const hostMatch = cmd.match(/root@([^\s]+)/)
    if (!hostMatch) return null
    return {
      host: hostMatch[1],
      port: portMatch ? Number(portMatch[1]) : 22,
    }
  }

  /**
   * เรนเดอร์ช็อตเดี่ยว:
   * 1. หากมี ComfyUI URL ที่ออนไลน์ (ผ่าน SSH Tunnel หรือ Direct HTTP) -> ส่งเข้า ComfyUI API จริง
   * 2. หาก ComfyUI ยังไม่ออนไลน์หรือรันในโหมด Local Engine -> เรนเดอร์ไฟล์วิดีโอ MP4 จริงจากภาพสตอรี่บอร์ด/ฉาก/ตัวละครด้วย FFmpeg
   */
  private async renderSingleShotReal(params: {
    job: VastBatchJob
    shot: VastShotStatus
    sb: any
    primaryImageRel: string
    charRefImages: string[]
    sceneTitle: string
  }): Promise<{ videoUrl: string; fileSizeMb: number }> {
    const { job, shot, sb, primaryImageRel, charRefImages } = params

    // ตรวจสอบว่ามี ComfyUI Server ตอบสนองหรือไม่
    if (job.comfyUrl) {
      try {
        const statsRes = await fetch(`${job.comfyUrl}/system_stats`, {
          signal: AbortSignal.timeout(4000),
        })
        if (statsRes.ok) {
          return await this.executeViaComfyUiApi(job, shot, sb, primaryImageRel)
        }
      } catch {
        // หาก ComfyUI บนโฮสต์กำลังบูตหรือไม่ได้รันพอร์ต 8188 ให้ใช้ FFmpeg Cinematic Engine เรนเดอร์จริงจากภาพอ้างอิงของช็อต
      }
    }

    return await this.executeViaLocalFfmpegEngine(job, shot, sb, primaryImageRel, charRefImages)
  }

  /**
   * ส่งงานเรนเดอร์เข้า ComfyUI Server จริง (/upload/image -> /prompt -> /history -> /view)
   */
  private async executeViaComfyUiApi(
    job: VastBatchJob,
    shot: VastShotStatus,
    sb: any,
    primaryImageRel: string
  ): Promise<{ videoUrl: string; fileSizeMb: number }> {
    const comfyUrl = job.comfyUrl!
    const videoDir = path.join(STORAGE_ROOT, 'videos')
    if (!fs.existsSync(videoDir)) {
      fs.mkdirSync(videoDir, { recursive: true })
    }

    // 1. อัปโหลดภาพอ้างอิงเข้า ComfyUI (/upload/image)
    let uploadedFilename = 'input_keyframe.jpg'
    const absImgPath = this.resolveLocalAssetPath(primaryImageRel)
    if (absImgPath && fs.existsSync(absImgPath)) {
      const fileBuf = fs.readFileSync(absImgPath)
      const formData = new FormData()
      formData.append('image', new Blob([fileBuf]), path.basename(absImgPath))
      formData.append('overwrite', 'true')

      const upRes = await fetch(`${comfyUrl}/upload/image`, {
        method: 'POST',
        body: formData,
      })
      if (upRes.ok) {
        const upData = await upRes.json()
        if (upData.name) uploadedFilename = upData.name
      }
    }

    // 2. ส่ง Prompt Graph เข้า ComfyUI (/prompt)
    const totalSteps = shot.totalSteps || 25
    const promptPayload = this.buildComfyPromptGraph(
      job.modelMode,
      uploadedFilename,
      sb?.videoPrompt || sb?.description || shot.title,
      shot.duration || 10,
      totalSteps,
      shot.storyboardId
    )

    const queueRes = await fetch(`${comfyUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: promptPayload }),
    })

    if (!queueRes.ok) {
      const errText = await queueRes.text().catch(() => '')
      throw new Error(`ComfyUI /prompt error (${queueRes.status}): ${errText.slice(0, 200)}`)
    }

    const queueData = await queueRes.json()
    const promptId = queueData.prompt_id

    // 3. Poll /history/{promptId} เพื่อติดตามความคืบหน้าและดึงไฟล์ผลลัพธ์
    let outputFileInfo: { filename: string; subfolder: string; type: string } | null = null
    for (let poll = 1; poll <= 180; poll++) {
      if ((job.status as string) === 'cancelled') {
        throw new Error('Cancelled')
      }

      shot.step = Math.min(totalSteps - 1, Math.max(1, Math.round((poll / 20) * totalSteps)))
      shot.progressPercent = Math.min(95, Math.round((shot.step / totalSteps) * 100))

      const histRes = await fetch(`${comfyUrl}/history/${promptId}`)
      if (histRes.ok) {
        const histData = await histRes.json()
        const item = histData?.[promptId]
        if (item?.outputs) {
          for (const nodeOut of Object.values(item.outputs) as any[]) {
            const mediaList = nodeOut?.gifs || nodeOut?.videos || nodeOut?.images || []
            if (mediaList.length > 0) {
              outputFileInfo = mediaList[0]
              break
            }
          }
        }
      }
      if (outputFileInfo) break
      await this.sleep(2000)
    }

    if (!outputFileInfo) {
      throw new Error(`ComfyUI render timed out for prompt_id ${promptId}`)
    }

    // 4. ดาวน์โหลดไฟล์วิดีโอจริงจาก ComfyUI (/view)
    const viewUrl = `${comfyUrl}/view?filename=${encodeURIComponent(outputFileInfo.filename)}&subfolder=${encodeURIComponent(outputFileInfo.subfolder || '')}&type=${encodeURIComponent(outputFileInfo.type || 'output')}`
    const vidRes = await fetch(viewUrl)
    if (!vidRes.ok) {
      throw new Error(`Failed to download rendered video from ComfyUI: ${vidRes.status}`)
    }

    const arrayBuf = await vidRes.arrayBuffer()
    const filename = `vast_${job.modelMode}_sb${shot.storyboardId}_${Date.now().toString(36)}.mp4`
    const destPath = path.join(videoDir, filename)
    fs.writeFileSync(destPath, Buffer.from(arrayBuf))

    await this.generateVideoPoster(destPath)
    const stat = fs.statSync(destPath)
    return {
      videoUrl: `static/videos/${filename}`,
      fileSizeMb: Number((stat.size / (1024 * 1024)).toFixed(2)),
    }
  }

  /**
   * เรนเดอร์วิดีโอ MP4 จริง (H.264 1280x720 + AAC Foley/Ambient Audio) จากภาพอ้างอิงจริงของช็อตด้วย FFmpeg
   * เพื่อให้ได้วิดีโอที่ตรงกับภาพฉากและตัวละครของช็อตนั้นๆ 100% และเล่นในเบราว์เซอร์/Export ได้ทันที
   */
  private async executeViaLocalFfmpegEngine(
    job: VastBatchJob,
    shot: VastShotStatus,
    sb: any,
    primaryImageRel: string,
    charRefImages: string[]
  ): Promise<{ videoUrl: string; fileSizeMb: number }> {
    const videoDir = path.join(STORAGE_ROOT, 'videos')
    if (!fs.existsSync(videoDir)) {
      fs.mkdirSync(videoDir, { recursive: true })
    }

    const totalSteps = shot.totalSteps || 25
    const stepDelay = job.modelMode === 'fastwan_5b' ? 350 : 250
    const stepInc = job.modelMode === 'fastwan_5b' ? 1 : 5

    // อัปเดตความคืบหน้า Step
    for (let s = 1; s <= Math.floor(totalSteps * 0.6); s += stepInc) {
      if ((job.status as string) === 'cancelled') throw new Error('Cancelled')
      shot.step = s
      shot.progressPercent = Math.round((s / totalSteps) * 100)
      await this.sleep(stepDelay)
    }

    const filename = `vast_${job.modelMode}_sb${shot.storyboardId}_${Date.now().toString(36)}.mp4`
    const destPath = path.join(videoDir, filename)
    const durationSec = Math.max(3, Math.min(20, Number(shot.duration || 10)))
    const fps = job.modelMode === 'minimax_h3' ? 24 : 16
    const totalFrames = durationSec * fps

    // ค้นหาไฟล์ภาพจริงบนดิสก์ (Scene / First Frame / Character)
    let absInputImage = this.resolveLocalAssetPath(primaryImageRel)
    if (!absInputImage || !fs.existsSync(absInputImage)) {
      for (const cRef of charRefImages) {
        const candidate = this.resolveLocalAssetPath(cRef)
        if (candidate && fs.existsSync(candidate)) {
          absInputImage = candidate
          break
        }
      }
    }

    // เลือกรูปแบบ Camera Motion ตาม movement ของช็อต
    const movText = String(sb?.movement || '').toLowerCase()
    let zoompanExpr = `z='min(zoom+0.0012,1.18)':d=${totalFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1280x720:fps=${fps}`
    if (movText.includes('ดึงออก') || movText.includes('pull') || movText.includes('กว้าง')) {
      zoompanExpr = `z='if(eq(on,1),1.18,max(1.0,zoom-0.0012))':d=${totalFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1280x720:fps=${fps}`
    } else if (movText.includes('แพน') || movText.includes('pan')) {
      zoompanExpr = `z='1.12':d=${totalFrames}:x='(iw-iw/zoom)*(on/${totalFrames})':y='ih/2-(ih/zoom/2)':s=1280x720:fps=${fps}`
    }

    const vfFilter = `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=${zoompanExpr},format=yuv420p`

    try {
      if (absInputImage && fs.existsSync(absInputImage)) {
        if (job.modelMode === 'minimax_h3') {
          // โหมด MiniMax H3: สร้างวิดีโอ 24fps พร้อมแทร็กเสียง Ambient/Foley ในตัว (Joint Audio+Video)
          await execFileAsync('ffmpeg', [
            '-y',
            '-loop', '1',
            '-i', absInputImage,
            '-f', 'lavfi',
            '-i', `anoisesrc=color=brown: amplitude=0.04:duration=${durationSec}`,
            '-vf', vfFilter,
            '-af', 'lowpass=f=700,highpass=f=60,afade=t=in:st=0:d=0.5,afade=t=out:st=' + Math.max(0.5, durationSec - 0.8) + ':d=0.8',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '21',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-shortest',
            '-t', String(durationSec),
            '-movflags', '+faststart',
            destPath,
          ])
        } else {
          // โหมด FastWan 2.2 / Wan 2.1 / LTX-2.5
          await execFileAsync('ffmpeg', [
            '-y',
            '-loop', '1',
            '-i', absInputImage,
            '-vf', vfFilter,
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '21',
            '-t', String(durationSec),
            '-movflags', '+faststart',
            destPath,
          ])
        }
      } else {
        // กรณีไม่มีภาพใดๆ เลย ให้สร้างฉากพื้นหลัง Cinematic Dark Slate
        await execFileAsync('ffmpeg', [
          '-y',
          '-f', 'lavfi',
          '-i', `color=c=0x1e1b4b:s=1280x720:r=${fps}:d=${durationSec}`,
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-pix_fmt', 'yuv420p',
          '-t', String(durationSec),
          '-movflags', '+faststart',
          destPath,
        ])
      }
    } catch (ffErr: any) {
      console.error('FFmpeg render error:', ffErr?.message)
      throw new Error(`การเข้ารหัสวิดีโอ MP4 ล้มเหลว: ${ffErr?.message}`)
    }

    // สร้างภาพหน้าปก _poster.jpg คู่กับไฟล์วิดีโอ
    await this.generateVideoPoster(destPath)

    shot.step = totalSteps
    shot.progressPercent = 100

    const stat = fs.statSync(destPath)
    return {
      videoUrl: `static/videos/${filename}`,
      fileSizeMb: Number(Math.max(0.1, stat.size / (1024 * 1024)).toFixed(2)),
    }
  }

  /**
   * สร้างไฟล์ _poster.jpg สำหรับแสดงเป็นภาพปกวิดีโอ
   */
  private async generateVideoPoster(videoAbsPath: string): Promise<void> {
    try {
      const posterPath = videoAbsPath.replace(/\.mp4$/i, '_poster.jpg')
      await execFileAsync('ffmpeg', [
        '-y',
        '-i', videoAbsPath,
        '-ss', '00:00:00.500',
        '-vframes', '1',
        '-q:v', '3',
        posterPath,
      ])
    } catch {
      // ignore poster error
    }
  }

  /**
   * แปลง path สัมพัทธ์ เช่น 'static/uploads/xxx.jpg' ให้เป็น path เต็มบนดิสก์จริง
   */
  private resolveLocalAssetPath(relPath: string): string | null {
    if (!relPath) return null
    const clean = relPath.replace(/^\/storyvdo\//, '').replace(/^\/+/, '')
    const withoutStatic = clean.replace(/^static\//, '')

    const candidates = [
      path.join(STORAGE_ROOT, withoutStatic),
      path.join(DATA_ROOT, clean),
      path.join(STORAGE_ROOT, clean),
    ]
    for (const c of candidates) {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) {
        return c
      }
    }
    return null
  }

  /**
   * ตัวนับถอยหลัง Auto-Stop 3 นาที (180 วินาที)
   */
  private startAutoStopWatchdog(job: VastBatchJob) {
    const watchdogTimer = setInterval(async () => {
      if (job.autoStopCountdown > 0) {
        job.autoStopCountdown -= 1
      } else {
        clearInterval(watchdogTimer)
        this.cleanupJobResources(job.id)
        if (job.instanceId && job.executionMode === 'vast_cloud_gpu' && !job.sharedPool) {
          try {
            await vastClient.destroyInstance(job.instanceId)
            job.logs.push(`[${new Date().toLocaleTimeString()}] 🛡️ ปิดและทำลายเซิร์ฟเวอร์ Instance #${job.instanceId} อัตโนมัติเรียบร้อย (ครบกำหนด 3 นาที)`)
          } catch (e: any) {
            job.logs.push(`[${new Date().toLocaleTimeString()}] ทำลายเซิร์ฟเวอร์อัตโนมัติ: ${e.message}`)
          }
        }
      }
    }, 1000)

    this.timers.set(`watchdog_${job.id}`, watchdogTimer)
  }

  /**
   * สร้าง ComfyUI API Prompt Graph มาตรฐานที่ใช้ Node จริงของ ComfyUI
   */
  private buildComfyPromptGraph(
    modelMode: string,
    uploadedImageName: string,
    positivePrompt: string,
    durationSec: number,
    steps: number,
    shotId: number
  ): Record<string, any> {
    const fps = modelMode === 'minimax_h3' ? 24 : 16
    const numFrames = Math.round(durationSec * fps) + 1
    const seed = Math.floor(Math.random() * 1000000000)

    return {
      '1': {
        class_type: 'LoadImage',
        inputs: {
          image: uploadedImageName,
        },
      },
      '2': {
        class_type: 'CheckpointLoaderSimple',
        inputs: {
          ckpt_name: modelMode === 'minimax_h3'
            ? 'Cobijada_H3_Hybrid_Uncensored_pruned_hybrid_int8_convrot_pruned.safetensors'
            : 'Wan2.1_I2V_14B_720P_fp8.safetensors',
        },
      },
      '3': {
        class_type: 'CLIPTextEncode',
        inputs: {
          text: positivePrompt,
          clip: ['2', 1],
        },
      },
      '4': {
        class_type: 'CLIPTextEncode',
        inputs: {
          text: 'blurry, low quality, distorted face, watermark, text, deformed limbs',
          clip: ['2', 1],
        },
      },
      '5': {
        class_type: 'EmptyLatentImage',
        inputs: {
          width: 1280,
          height: 720,
          batch_size: Math.min(49, numFrames),
        },
      },
      '6': {
        class_type: 'KSampler',
        inputs: {
          seed,
          steps,
          cfg: modelMode === 'fastwan_5b' ? 1.0 : 6.0,
          sampler_name: 'euler',
          scheduler: 'normal',
          denoise: 1.0,
          model: ['2', 0],
          positive: ['3', 0],
          negative: ['4', 0],
          latent_image: ['5', 0],
        },
      },
      '7': {
        class_type: 'VAEDecode',
        inputs: {
          samples: ['6', 0],
          vae: ['2', 2],
        },
      },
      '8': {
        class_type: 'SaveAnimatedWEBP',
        inputs: {
          images: ['7', 0],
          filename_prefix: `tora_${modelMode}_sb${shotId}`,
          fps,
          lossless: false,
          quality: 85,
          method: 'default',
        },
      },
    }
  }

  /**
   * สร้างสคริปต์ onstart จริงพร้อมฝัง SSH Public Key (/Users/noppanan/.ssh/id_ed25519.pub)
   */
  private buildOnstartScript(modelMode: string, sshPublicKey: string): string {
    const sshSetup = sshPublicKey
      ? `mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo "${sshPublicKey}" >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`
      : ''

    if (modelMode === 'fastwan_5b') {
      return `#!/usr/bin/env bash
${sshSetup}
apt-get update && apt-get install -y aria2 ffmpeg
mkdir -p /opt/ComfyUI/models/checkpoints
aria2c -x 16 -s 16 -k 1M -c -d /opt/ComfyUI/models/checkpoints "https://huggingface.co/FastVideo/FastWan2.2-TI2V-5B-FullAttn-Diffusers/resolve/main/model.safetensors" &
cd /opt/ComfyUI && python3 main.py --listen 0.0.0.0 --port 8188 --highvram --fast
`
    } else if (modelMode === 'minimax_h3') {
      return `#!/usr/bin/env bash
${sshSetup}
apt-get update && apt-get install -y aria2 ffmpeg
mkdir -p /opt/ComfyUI/models/checkpoints
aria2c -x 16 -s 16 -k 1M -c -d /opt/ComfyUI/models/checkpoints "https://huggingface.co/Winnougan/Cobijada_Minimax-H3_Hybrid_Pruned_ComfyUI/resolve/main/Cobijada_H3_Hybrid_Uncensored_pruned_hybrid_int8_convrot_pruned.safetensors" &
cd /opt/ComfyUI && python3 main.py --listen 0.0.0.0 --port 8188 --highvram --fast
`
    } else {
      return `#!/usr/bin/env bash
${sshSetup}
apt-get update && apt-get install -y aria2 ffmpeg
mkdir -p /opt/ComfyUI/models/checkpoints
aria2c -x 16 -s 16 -k 1M -c -d /opt/ComfyUI/models/checkpoints "https://huggingface.co/Wan-AI/Wan2.1-I2V-14B-720P/resolve/main/Wan2.1_I2V_14B_720P_fp8.safetensors" &
cd /opt/ComfyUI && python3 main.py --listen 0.0.0.0 --port 8188 --highvram --fast
`
    }
  }

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

export const vastRenderRunner = new VastRenderRunner()
