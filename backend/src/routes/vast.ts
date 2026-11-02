/**
 * Vast.ai GPU Routes (Production Ready)
 * การค้นหา GPU, ตั้งค่า Vast API Key & SSH Key, ตรวจสอบเงินสำรอง $20, และการรันคิวงานจริง
 */
import { Hono } from 'hono'
import { vastClient, VAST_GPU_CATALOGUE } from '../services/vast-client.js'
import { vastRenderRunner } from '../services/vast-runner.js'
import { getVastPricingConfig } from '../services/app-settings.js'
import { success, badRequest, notFound } from '../utils/response.js'

const app = new Hono()

// GET /config — ดึงการตั้งค่า Vast API Key, Direct SSH/ComfyUI URL, และสถานะ SSH Key (/Users/noppanan/.ssh/id_ed25519.pub)
app.get('/config', async (c) => {
  const cfg = vastClient.getConnectionConfig()
  const balance = await vastClient.getAccountBalance()
  return success(c, {
    ...cfg,
    balance,
  })
})

// PUT /config — บันทึก Vast API Key และ/หรือ Direct SSH Command / ComfyUI URL พร้อมซิงก์ SSH Key
app.put('/config', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  if (typeof body.apiKey === 'string') {
    vastClient.setApiKey(body.apiKey)
  }
  if (body.directComfyUrl !== undefined || body.directSshCommand !== undefined) {
    vastClient.setDirectEndpoints({
      directComfyUrl: body.directComfyUrl,
      directSshCommand: body.directSshCommand,
    })
  }

  let sshSynced = false
  if (vastClient.getApiKey()) {
    sshSynced = await vastClient.ensureSshKeyRegistered()
  }

  const cfg = vastClient.getConnectionConfig()
  const balance = await vastClient.getAccountBalance()
  return success(c, {
    ...cfg,
    sshSynced,
    balance,
  })
})

// GET /balance — ตรวจสอบยอดเงินคงเหลือใน Vast.ai (เช็คเกณฑ์สำรอง $20)
app.get('/balance', async (c) => {
  try {
    const data = await vastClient.getAccountBalance()
    return success(c, data)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// GET /gpus — รายการแคตตาล็อก GPU ทั้งหมดพร้อมสเปก TFLOPS และราคากลาง
app.get('/gpus', async (c) => {
  const config = getVastPricingConfig()
  const gpusWithPricing = VAST_GPU_CATALOGUE.map(g => {
    const customerDphUsd = g.medianDphUsd * (1 + config.markupPercent / 100)
    const customerDphThb = customerDphUsd * config.usdToThbRate
    const estPricePerShotThb = Math.max(config.minShotPriceThb, (customerDphThb / 3600) * 65)
    return {
      ...g,
      customerDphUsd: Number(customerDphUsd.toFixed(3)),
      customerDphThb: Number(customerDphThb.toFixed(2)),
      estPricePerShotThb: Number(estPricePerShotThb.toFixed(2)),
      tflopsPerDph: Number((g.tflops / g.medianDphUsd).toFixed(1)),
    }
  })
  return success(c, {
    catalogue: gpusWithPricing,
    pricingConfig: config,
  })
})

// POST /search — ค้นหาเครื่อง GPU ตามเงื่อนไข (GPU, TFLOPS/Hr, Template)
app.post('/search', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try {
    const offers = await vastClient.searchOffers({
      gpuNames: body.gpuNames,
      minVramGb: body.minVramGb,
      minReliability: body.minReliability,
      templateHashId: body.templateHashId,
      sortBy: body.sortBy,
      limit: body.limit || 15,
    })
    return success(c, { offers })
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /estimate-batch — คำนวณเวลา, ค่าใช้จ่าย (+40%), และพื้นที่ R2 สำหรับคิวงานหลายตอน
app.post('/estimate-batch', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { shots = [], gpuId = 'rtx4090', modelMode = 'minimax_h3' } = body

  const config = getVastPricingConfig()
  const gpuSpec = VAST_GPU_CATALOGUE.find(g => g.id === gpuId) || VAST_GPU_CATALOGUE[2]

  const totalShots = shots.length
  const totalDurationSec = shots.reduce((acc: number, s: any) => acc + (s.duration || 10), 0)

  let baseSpeedFactor = 5.0
  let minShotRate = config.minShotPriceThb

  if (modelMode === 'fastwan_5b') {
    baseSpeedFactor = 0.55
    minShotRate = Math.max(0.35, config.minShotPriceThb * 0.25)
  } else if (modelMode === 'ltx_2_5') {
    baseSpeedFactor = 1.2
    minShotRate = Math.max(0.65, config.minShotPriceThb * 0.45)
  } else if (modelMode === 'wan2.1_14b') {
    baseSpeedFactor = 6.0
  }

  const speedMultiplier = gpuSpec.tflops > 80 ? 1.0 : (gpuSpec.tflops > 35 ? 1.6 : 2.2)
  const estComputeSeconds = Math.max(totalShots * (modelMode === 'fastwan_5b' ? 4 : 20), totalDurationSec * baseSpeedFactor * speedMultiplier)
  const estHours = estComputeSeconds / 3600

  const baseCostUsd = estHours * gpuSpec.medianDphUsd
  const customerCostUsd = baseCostUsd * (1 + config.markupPercent / 100)
  const customerCostThb = customerCostUsd * config.usdToThbRate
  const estPricePerShotThb = Math.max(minShotRate, customerCostThb / (totalShots || 1))

  const estStorageMb = totalShots * (modelMode === 'minimax_h3' ? 18 : 14)
  const estStorageGb = estStorageMb / 1024

  return success(c, {
    totalShots,
    totalDurationSec,
    modelMode,
    gpu: gpuSpec,
    estComputeSeconds: Math.round(estComputeSeconds),
    estComputeTimeFormatted: estComputeSeconds < 60
      ? `${Math.round(estComputeSeconds)} วินาที`
      : `${Math.floor(estComputeSeconds / 60)} นาที ${Math.round(estComputeSeconds % 60)} วินาที`,
    baseCostUsd: Number(baseCostUsd.toFixed(3)),
    markupPercent: config.markupPercent,
    customerCostUsd: Number(customerCostUsd.toFixed(3)),
    customerCostThb: Number(customerCostThb.toFixed(2)),
    estPricePerShotThb: Number(estPricePerShotThb.toFixed(2)),
    totalEstPriceThb: Number((totalShots * estPricePerShotThb).toFixed(2)),
    estStorageMb,
    estStorageGb: Number(estStorageGb.toFixed(2)),
    r2FreeQuotaGb: 5.0,
    r2WithinQuota: estStorageGb <= 5.0,
  })
})

// POST /create-instance — ตรวจสอบ $20 และจองเครื่องบน Vast.ai
app.post('/create-instance', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { offerId, templateHashId, dockerImage, diskGb } = body

  if (!offerId) {
    return badRequest(c, 'offerId is required')
  }

  try {
    const result = await vastClient.createInstance(offerId, {
      templateHashId,
      dockerImage,
      diskGb,
    })
    return success(c, result)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// DELETE /instances/:id — สั่งทำลายเครื่อง
app.delete('/instances/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!id) return badRequest(c, 'Invalid instance id')
  const ok = await vastClient.destroyInstance(id)
  return success(c, { success: ok })
})

// POST /render-batch — สั่งรันคิวงานเรนเดอร์หลายช็อต / ข้ามตอนบน Vast.ai
app.post('/render-batch', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const {
    shotIds,
    shotOverrides,
    dramaId,
    episodeId,
    gpuId,
    modelMode,
    templateHashId,
    directComfyUrl,
    directSshCommand,
  } = body

  if (!shotIds || !Array.isArray(shotIds) || shotIds.length === 0) {
    return badRequest(c, 'shotIds is required and must not be empty')
  }

  try {
    const job = await vastRenderRunner.startBatchJob({
      shotIds,
      shotOverrides,
      dramaId: Number(dramaId || 0),
      episodeId: Number(episodeId || 0),
      gpuId,
      modelMode,
      templateHashId,
      directComfyUrl,
      directSshCommand,
    })
    return success(c, { job })
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// GET /render-batch/:id — ตรวจสอบสถานะความคืบหน้าของคิวงานเรนเดอร์
app.get('/render-batch/:id', async (c) => {
  const id = c.req.param('id')
  const job = vastRenderRunner.getJob(id)
  if (!job) {
    return notFound(c, 'Render batch job not found')
  }
  return success(c, { job })
})

// POST /render-batch/:id/cancel — สั่งยกเลิกคิวงานและทำลาย Instance ทันที
app.post('/render-batch/:id/cancel', async (c) => {
  const id = c.req.param('id')
  const ok = await vastRenderRunner.cancelJob(id)
  if (!ok) {
    return notFound(c, 'Job not found or already terminated')
  }
  return success(c, { success: true })
})

// GET /active-batch/:episodeId — ตรวจสอบงานที่กำลังรันของ Episode นี้
app.get('/active-batch/:episodeId', async (c) => {
  const episodeId = Number(c.req.param('episodeId'))
  const job = vastRenderRunner.getActiveJobForEpisode(episodeId)
  return success(c, { job })
})

export default app
