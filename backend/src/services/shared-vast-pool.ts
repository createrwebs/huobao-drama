import { and, asc, eq, inArray } from 'drizzle-orm'
import { db, getInsertId, schema } from '../db/index.js'
import { getUserToraApiKey, reserveToraVideo, settleToraVideo } from './tora-client.js'
import { vastClient } from './vast-client.js'
import { vastRenderRunner } from './vast-runner.js'
import { now } from '../utils/response.js'
import { getVastPricingConfig } from './app-settings.js'

const POOL_KEY = 'minimax_h3'
const MODEL = 'minimax_h3'
const TICK_MS = 2000

export function isSharedPoolIdleExpired(idleSince: string | null | undefined, timeoutSeconds: number, at = Date.now()) {
  if (!idleSince || !Number.isFinite(timeoutSeconds) || timeoutSeconds < 0) return false
  const idleAt = Date.parse(idleSince)
  return Number.isFinite(idleAt) && at - idleAt >= timeoutSeconds * 1000
}

type PoolStatus = 'stopped' | 'starting' | 'ready' | 'busy' | 'idle' | 'terminating' | 'failed'

class SharedVastPool {
  private started = false
  private ticking = false
  private timer?: NodeJS.Timeout

  start() {
    if (this.started) return
    this.started = true
    this.timer = setInterval(() => { void this.tick() }, TICK_MS)
    this.timer.unref?.()
    void this.recoverInterruptedJobs()
    void this.tick()
  }

  private async recoverInterruptedJobs() {
    const interrupted = await db.select().from(schema.vastRenderQueue)
      .where(and(eq(schema.vastRenderQueue.poolKey, POOL_KEY), inArray(schema.vastRenderQueue.status, ['starting', 'rendering'])))
    for (const job of interrupted) {
      const apiKey = await getUserToraApiKey(job.ownerUserId)
      const requestId = job.toraRequestId || `hb-shared-${job.id}`
      if (apiKey) {
        await settleToraVideo(apiKey, {
          requestId,
          success: false,
          errorMessage: 'Huobao server restarted before shared render completed',
        }).catch(() => {})
      }
      await db.insert(schema.vastUsageLedger).values({
        idempotencyKey: `queue:${job.id}:restart-refund`,
        queueId: job.id,
        ownerUserId: job.ownerUserId,
        eventType: 'refund',
        quotaAmount: 0,
        toraRequestId: requestId,
        createdAt: now(),
      }).onConflictDoNothing()
      await db.update(schema.vastRenderQueue).set({
        status: 'queued',
        runnerJobId: null,
        reservedQuota: 0,
        toraRequestId: null,
        errorMsg: 'ระบบกลับมาใหม่ งานถูกนำกลับเข้าคิวอัตโนมัติ',
        updatedAt: now(),
      }).where(and(eq(schema.vastRenderQueue.id, job.id), inArray(schema.vastRenderQueue.status, ['starting', 'rendering'])))
    }
    if (interrupted.length) {
      const pool = await this.getPool()
      await db.update(schema.vastRenderPools).set({
        status: pool.instanceId ? 'idle' : 'stopped',
        idleSince: pool.instanceId ? now() : null,
        updatedAt: now(),
      }).where(eq(schema.vastRenderPools.id, pool.id))
    }
  }

  async enqueue(params: {
    ownerUserId: number
    dramaId: number
    episodeId?: number
    storyboardIds: number[]
    gpuId?: string
  }) {
    if (!params.storyboardIds.length) throw new Error('กรุณาเลือก storyboard อย่างน้อย 1 ช็อต')
    const existing = await db.select({ id: schema.vastRenderQueue.id })
      .from(schema.vastRenderQueue)
      .where(and(
        eq(schema.vastRenderQueue.ownerUserId, params.ownerUserId),
        inArray(schema.vastRenderQueue.status, ['queued', 'starting', 'rendering']),
      ))
    if (existing.length >= 10) throw new Error('ผู้ใช้รายนี้มีงานในคิวมากเกินไป กรุณารอให้งานเดิมเสร็จ')

    const ts = now()
    const estimatedSeconds = Math.max(params.storyboardIds.length * 20, params.storyboardIds.length * 10)
    const result = await db.insert(schema.vastRenderQueue).values({
      ownerUserId: params.ownerUserId,
      poolKey: POOL_KEY,
      dramaId: params.dramaId,
      episodeId: params.episodeId ?? null,
      storyboardIds: JSON.stringify(params.storyboardIds),
      status: 'queued',
      estimatedSeconds,
      createdAt: ts,
      updatedAt: ts,
    })
    this.start()
    return this.getJobView(getInsertId(result), params.ownerUserId)
  }

  async getJobView(id: number, ownerUserId: number) {
    const [job] = await db.select().from(schema.vastRenderQueue)
      .where(and(eq(schema.vastRenderQueue.id, id), eq(schema.vastRenderQueue.ownerUserId, ownerUserId)))
    if (!job) return null
    const ahead = await db.select({ id: schema.vastRenderQueue.id }).from(schema.vastRenderQueue)
      .where(and(eq(schema.vastRenderQueue.poolKey, POOL_KEY), eq(schema.vastRenderQueue.status, 'queued')))
      .orderBy(asc(schema.vastRenderQueue.createdAt), asc(schema.vastRenderQueue.id))
    const position = job.status === 'queued' ? ahead.findIndex(x => x.id === id) + 1 : 0
    const pool = await this.getPool()
    return {
      ...job,
      storyboard_ids: JSON.parse(job.storyboardIds),
      queue_position: position,
      pool_status: pool.status,
      runner_job: job.runnerJobId ? vastRenderRunner.getJob(job.runnerJobId) : null,
    }
  }

  async getQueue(ownerUserId: number) {
    const jobs = await db.select().from(schema.vastRenderQueue)
      .where(and(eq(schema.vastRenderQueue.ownerUserId, ownerUserId), inArray(schema.vastRenderQueue.status, ['queued', 'starting', 'rendering'])))
      .orderBy(asc(schema.vastRenderQueue.createdAt), asc(schema.vastRenderQueue.id))
    const pool = await this.getPool()
    return { pool, items: await Promise.all(jobs.map(j => this.getJobView(j.id, ownerUserId))) }
  }

  async cancel(id: number, ownerUserId: number) {
    const [job] = await db.select().from(schema.vastRenderQueue)
      .where(and(eq(schema.vastRenderQueue.id, id), eq(schema.vastRenderQueue.ownerUserId, ownerUserId)))
    if (!job || !['queued', 'starting', 'rendering'].includes(job.status)) return false
    if (job.runnerJobId) await vastRenderRunner.cancelJob(job.runnerJobId)
    const cancelled = await db.update(schema.vastRenderQueue)
      .set({ status: 'cancelled', updatedAt: now(), completedAt: now() })
      .where(and(eq(schema.vastRenderQueue.id, id), inArray(schema.vastRenderQueue.status, ['queued', 'starting', 'rendering'])))
      .returning({ id: schema.vastRenderQueue.id })
    if (!cancelled.length) return false
    if (job.toraRequestId) {
      const apiKey = await getUserToraApiKey(ownerUserId)
      if (apiKey) await settleToraVideo(apiKey, { requestId: job.toraRequestId, success: false, errorMessage: 'Shared render cancelled by user' }).catch(() => {})
      await db.insert(schema.vastUsageLedger).values({
        idempotencyKey: `queue:${job.id}:cancel-refund`,
        queueId: job.id,
        ownerUserId,
        eventType: 'refund',
        quotaAmount: 0,
        toraRequestId: job.toraRequestId,
        createdAt: now(),
      }).onConflictDoNothing()
    }
    return true
  }

  async status() {
    const pool = await this.getPool()
    const queued = await db.select({ id: schema.vastRenderQueue.id }).from(schema.vastRenderQueue).where(and(eq(schema.vastRenderQueue.poolKey, POOL_KEY), inArray(schema.vastRenderQueue.status, ['queued', 'starting', 'rendering'])))
    return { ...pool, queueLength: queued.length, model: MODEL }
  }

  private async getPool() {
    const [existing] = await db.select().from(schema.vastRenderPools).where(eq(schema.vastRenderPools.poolKey, POOL_KEY))
    if (existing) return existing
    const ts = now()
    const result = await db.insert(schema.vastRenderPools).values({ poolKey: POOL_KEY, model: MODEL, status: 'stopped', createdAt: ts, updatedAt: ts })
    const [created] = await db.select().from(schema.vastRenderPools).where(eq(schema.vastRenderPools.id, getInsertId(result)))
    return created
  }

  private async tick() {
    if (this.ticking) return
    this.ticking = true
    try {
      const pool = await this.getPool()
      const active = await db.select().from(schema.vastRenderQueue)
        .where(and(eq(schema.vastRenderQueue.poolKey, POOL_KEY), inArray(schema.vastRenderQueue.status, ['starting', 'rendering'])))
      if (active.length) {
        const activeRunner = active[0].runnerJobId ? vastRenderRunner.getJob(active[0].runnerJobId) : null
        if (activeRunner && (activeRunner.instanceId || activeRunner.comfyUrl)) {
          await db.update(schema.vastRenderPools).set({
            instanceId: activeRunner.instanceId || pool.instanceId,
            contractId: activeRunner.contractId || pool.contractId,
            comfyUrl: activeRunner.comfyUrl || pool.comfyUrl,
            status: activeRunner.status === 'rendering' ? 'busy' : 'starting',
            updatedAt: now(),
          }).where(eq(schema.vastRenderPools.id, pool.id))
        }
        await this.reconcileActive(active[0])
        return
      }
    const [next] = await db.select().from(schema.vastRenderQueue)
        .where(and(eq(schema.vastRenderQueue.poolKey, POOL_KEY), eq(schema.vastRenderQueue.status, 'queued')))
        .orderBy(asc(schema.vastRenderQueue.createdAt), asc(schema.vastRenderQueue.id)).limit(1)
      if (next) {
        await this.runNext(next, pool)
        return
      }
      const pricing = getVastPricingConfig()
      if (pool.instanceId && isSharedPoolIdleExpired(pool.idleSince, pricing.sharedIdleTimeoutSeconds)) {
        await db.update(schema.vastRenderPools).set({ status: 'terminating', updatedAt: now() }).where(eq(schema.vastRenderPools.id, pool.id))
        await vastClient.destroyInstance(pool.instanceId)
        await db.update(schema.vastRenderPools).set({ status: 'stopped', instanceId: null, contractId: null, comfyUrl: null, idleSince: null, updatedAt: now() }).where(eq(schema.vastRenderPools.id, pool.id))
      } else if (pool.status !== 'idle') {
        await db.update(schema.vastRenderPools).set({ status: pool.instanceId ? 'idle' : 'stopped', updatedAt: now(), idleSince: pool.instanceId ? (pool.idleSince || now()) : null }).where(eq(schema.vastRenderPools.id, pool.id))
      }
    } catch (err: any) {
      console.error('[shared-vast-pool]', err?.message || err)
    } finally {
      this.ticking = false
    }
  }

  private async runNext(queueJob: typeof schema.vastRenderQueue.$inferSelect, pool: typeof schema.vastRenderPools.$inferSelect) {
    const ids = JSON.parse(queueJob.storyboardIds) as number[]
    const apiKey = await getUserToraApiKey(queueJob.ownerUserId)
    if (!apiKey) {
      await db.update(schema.vastRenderQueue).set({ status: 'failed', errorMsg: 'ไม่พบ Tora API key', updatedAt: now(), completedAt: now() }).where(eq(schema.vastRenderQueue.id, queueJob.id))
      return
    }
    const claim = await db.update(schema.vastRenderQueue)
      .set({ status: 'starting', startedAt: now(), updatedAt: now() })
      .where(and(eq(schema.vastRenderQueue.id, queueJob.id), eq(schema.vastRenderQueue.status, 'queued')))
      .returning({ id: schema.vastRenderQueue.id })
    if (!claim.length) return
    const requestId = `hb-shared-${queueJob.id}`
    const pricing = getVastPricingConfig()
    let reserved = false
    try {
      const reservation = await reserveToraVideo(apiKey, { requestId, model: MODEL, resolution: '720P', maxDurationSeconds: Math.max(queueJob.estimatedSeconds || 10, 10) })
      reserved = true
      const quotaPerSecond = pricing.sharedQuotaPerSecond
      await db.insert(schema.vastUsageLedger).values({ idempotencyKey: `queue:${queueJob.id}:reserve`, queueId: queueJob.id, ownerUserId: queueJob.ownerUserId, eventType: 'reserve', durationSeconds: queueJob.estimatedSeconds || 0, quotaPerSecond, quotaAmount: reservation.reservedQuota, toraRequestId: requestId, createdAt: now() }).onConflictDoNothing()
      const reservationAttached = await db.update(schema.vastRenderQueue)
        .set({ reservedQuota: reservation.reservedQuota, toraRequestId: requestId, updatedAt: now() })
        .where(and(eq(schema.vastRenderQueue.id, queueJob.id), eq(schema.vastRenderQueue.status, 'starting')))
        .returning({ id: schema.vastRenderQueue.id })
      if (!reservationAttached.length) {
        await this.refundReservation(apiKey, queueJob, requestId, 'Shared render cancelled before worker startup')
        return
      }
      await db.update(schema.vastRenderPools).set({ status: 'starting', gpuId: pool.gpuId || 'rtx4090', updatedAt: now() }).where(eq(schema.vastRenderPools.id, pool.id))
      const runnerJob = await vastRenderRunner.startBatchJob({
        shotIds: ids,
        dramaId: queueJob.dramaId,
        episodeId: queueJob.episodeId || 0,
        gpuId: pool.gpuId || 'rtx4090',
        modelMode: MODEL,
        scope: 'episode',
        sharedPool: true,
        reuseInstanceId: pool.instanceId || undefined,
        reuseComfyUrl: pool.comfyUrl || undefined,
      })
      const rendering = await db.update(schema.vastRenderQueue)
        .set({ status: 'rendering', runnerJobId: runnerJob.id, updatedAt: now() })
        .where(and(eq(schema.vastRenderQueue.id, queueJob.id), eq(schema.vastRenderQueue.status, 'starting')))
        .returning({ id: schema.vastRenderQueue.id })
      if (!rendering.length) {
        await vastRenderRunner.cancelJob(runnerJob.id)
        return
      }
      await db.update(schema.vastRenderPools).set({ status: 'busy', lastUsedAt: now(), idleSince: null, instanceId: runnerJob.instanceId || pool.instanceId, contractId: runnerJob.contractId || pool.contractId, comfyUrl: runnerJob.comfyUrl || pool.comfyUrl, updatedAt: now() }).where(eq(schema.vastRenderPools.id, pool.id))
    } catch (err: any) {
      if (reserved) await this.refundReservation(apiKey, queueJob, requestId, err?.message || 'Shared worker startup failed')
      await db.update(schema.vastRenderQueue).set({ status: 'failed', errorMsg: err?.message || 'Shared worker startup failed', completedAt: now(), updatedAt: now() }).where(and(eq(schema.vastRenderQueue.id, queueJob.id), inArray(schema.vastRenderQueue.status, ['starting', 'rendering'])))
      await db.update(schema.vastRenderPools).set({ status: 'failed', lastError: err?.message || 'Shared worker startup failed', updatedAt: now() }).where(eq(schema.vastRenderPools.id, pool.id))
    }
  }

  private async refundReservation(apiKey: string, queueJob: typeof schema.vastRenderQueue.$inferSelect, requestId: string, errorMessage: string) {
    await settleToraVideo(apiKey, { requestId, success: false, errorMessage }).catch(() => {})
    await db.insert(schema.vastUsageLedger).values({
      idempotencyKey: `queue:${queueJob.id}:startup-refund`,
      queueId: queueJob.id,
      ownerUserId: queueJob.ownerUserId,
      eventType: 'refund',
      quotaAmount: 0,
      toraRequestId: requestId,
      createdAt: now(),
    }).onConflictDoNothing()
  }

  private async reconcileActive(queueJob: typeof schema.vastRenderQueue.$inferSelect) {
    if (!queueJob.runnerJobId) return
    const runnerJob = vastRenderRunner.getJob(queueJob.runnerJobId)
    if (!runnerJob || !['completed', 'failed', 'cancelled'].includes(runnerJob.status)) return
    const actualSeconds = Math.max(1, Math.round(runnerJob.renderElapsedSeconds || 1))
    const apiKey = await getUserToraApiKey(queueJob.ownerUserId)
    const [ledger] = await db.select().from(schema.vastUsageLedger).where(and(eq(schema.vastUsageLedger.queueId, queueJob.id), eq(schema.vastUsageLedger.eventType, 'reserve')))
    const quotaPerSecond = ledger?.quotaPerSecond || 0
    if (apiKey && queueJob.toraRequestId) await settleToraVideo(apiKey, { requestId: queueJob.toraRequestId, success: runnerJob.status === 'completed', actualDurationSeconds: actualSeconds, errorMessage: runnerJob.error }).catch(() => {})
    const terminal = await db.update(schema.vastRenderQueue).set({ status: runnerJob.status, actualSeconds, chargedQuota: runnerJob.status === 'completed' ? actualSeconds * quotaPerSecond : 0, errorMsg: runnerJob.error, completedAt: now(), updatedAt: now() }).where(and(eq(schema.vastRenderQueue.id, queueJob.id), inArray(schema.vastRenderQueue.status, ['starting', 'rendering']))).returning({ id: schema.vastRenderQueue.id })
    if (!terminal.length) return
    await db.insert(schema.vastUsageLedger).values({ idempotencyKey: `queue:${queueJob.id}:${runnerJob.status === 'completed' ? 'settle' : 'refund'}`, queueId: queueJob.id, ownerUserId: queueJob.ownerUserId, eventType: runnerJob.status === 'completed' ? 'settle' : 'refund', durationSeconds: actualSeconds, quotaPerSecond, quotaAmount: runnerJob.status === 'completed' ? actualSeconds * quotaPerSecond : 0, toraRequestId: queueJob.toraRequestId, createdAt: now() }).onConflictDoNothing()
    const pool = await this.getPool()
    await db.update(schema.vastRenderPools).set({ status: 'idle', idleSince: now(), lastUsedAt: now(), updatedAt: now() }).where(eq(schema.vastRenderPools.id, pool.id))
  }
}

export const sharedVastPool = new SharedVastPool()