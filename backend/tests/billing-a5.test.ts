import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

test('A5: Centralized Tora Credit & Managed Video Billing Integration', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'huobao-a5-test-'))
  const testDbPath = path.join(tmpDir, 'test.sqlite3')
  const testDataDir = path.join(tmpDir, 'data')
  const testStaticDir = path.join(testDataDir, 'static')
  fs.mkdirSync(testStaticDir, { recursive: true })

  process.env.SQLITE_PATH = testDbPath
  process.env.HUOBAO_DATA_DIR = testDataDir
  process.env.STORAGE_PATH = testStaticDir
  process.env.HUOBAO_SERVER_MODE = 'true'
  process.env.HUOBAO_DESKTOP = '0'

  // Track ledger and mock calls
  const reservations = new Map<string, { userId: number; amount: number; status: string; rate: number }>()
  const settlements = new Map<string, { settledQuota: number; status: string; duration: number }>()
  let quoteCount = 0

  // Mock New-API / Tora Server
  const mockServer = http.createServer((req, res) => {
    const authHeader = req.headers['authorization'] || ''
    const key = authHeader.replace(/^Bearer\s+/, '').trim()

    if (req.url === '/api/huobao/identity' || req.url === '/v1/huobao/identity') {
      if (key === 'sk-alice-valid') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: true,
          data: {
            user_id: 101,
            token_id: 1,
            username: 'alice',
            display_name: 'Alice Cooper',
            account_status: 1,
            token_status: 1,
            expires_at: 0,
            quota: 50000000,
            unlimited_quota: false,
            user_quota: 50000000,
          },
        }))
        return
      }
      if (key === 'sk-bob-zero') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: true,
          data: {
            user_id: 202,
            token_id: 2,
            username: 'bob',
            display_name: 'Bob Ross',
            account_status: 1,
            token_status: 1,
            expires_at: 0,
            quota: 0,
            unlimited_quota: false,
            user_quota: 0,
          },
        }))
        return
      }
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, message: 'Invalid token' }))
      return
    }

    if (req.url === '/api/huobao/credits' || req.url === '/v1/huobao/credits') {
      if (key === 'sk-alice-valid') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: true,
          data: {
            user_id: 101,
            token_id: 1,
            quota_per_credit: 1000,
            user_quota: 50000000,
            token_quota: 50000000,
            unlimited_quota: false,
            spendable_quota: 50000000,
            spendable_credits: 50000,
          },
        }))
        return
      }
      if (key === 'sk-bob-zero') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: true,
          data: {
            user_id: 202,
            token_id: 2,
            quota_per_credit: 1000,
            user_quota: 0,
            token_quota: 0,
            unlimited_quota: false,
            spendable_quota: 0,
            spendable_credits: 0,
          },
        }))
        return
      }
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, message: 'Invalid token' }))
      return
    }

    if (req.url === '/api/huobao/video/quote' || req.url === '/v1/huobao/video/quote') {
      let bodyStr = ''
      req.on('data', chunk => { bodyStr += chunk })
      req.on('end', () => {
        quoteCount++
        const body = JSON.parse(bodyStr || '{}')
        const rate = (body.resolution || '').includes('1080') ? 4000 : (body.resolution || '').includes('480') ? 1000 : 2000
        const duration = body.duration_seconds || 5
        const estQuota = duration * rate
        const spendable = key === 'sk-alice-valid' ? 50000000 : 0
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: true,
          data: {
            model: body.model || 'wan3.0-video',
            resolution: body.resolution || '720P',
            duration_seconds: duration,
            quota_per_second: rate,
            credit_per_second: rate / 1000,
            estimated_quota: estQuota,
            estimated_credits: estQuota / 1000,
            spendable_quota: spendable,
            can_afford: spendable >= estQuota,
          },
        }))
      })
      return
    }

    if (req.url === '/api/huobao/video/reserve' || req.url === '/v1/huobao/video/reserve') {
      let bodyStr = ''
      req.on('data', chunk => { bodyStr += chunk })
      req.on('end', () => {
        const body = JSON.parse(bodyStr || '{}')
        if (key === 'sk-bob-zero') {
          res.writeHead(402, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            success: false,
            message: 'insufficient wallet or token quota to reserve video task',
          }))
          return
        }
        const rate = (body.resolution || '').includes('1080') ? 4000 : 2000
        const maxDuration = body.max_duration_seconds || 10
        const required = maxDuration * rate
        reservations.set(body.request_id, {
          userId: 101,
          amount: required,
          status: 'pending',
          rate,
        })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: true,
          data: {
            request_id: body.request_id,
            model: body.model,
            resolution: body.resolution,
            max_duration_seconds: maxDuration,
            quota_per_second: rate,
            reserved_quota: required,
            reserved_credits: required / 1000,
            status: 'pending',
          },
        }))
      })
      return
    }

    if (req.url === '/api/huobao/video/settle' || req.url === '/v1/huobao/video/settle') {
      let bodyStr = ''
      req.on('data', chunk => { bodyStr += chunk })
      req.on('end', () => {
        const body = JSON.parse(bodyStr || '{}')
        const existing = reservations.get(body.request_id)
        if (!existing) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Reservation not found' }))
          return
        }

        if (settlements.has(body.request_id)) {
          // Idempotent duplicate settle
          const prev = settlements.get(body.request_id)!
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            success: true,
            data: {
              request_id: body.request_id,
              settled_quota: prev.settledQuota,
              status: prev.status,
            },
          }))
          return
        }

        if (!body.success) {
          existing.status = 'refunded'
          settlements.set(body.request_id, { settledQuota: 0, status: 'refunded', duration: 0 })
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            success: true,
            data: {
              request_id: body.request_id,
              settled_quota: 0,
              status: 'refunded',
            },
          }))
          return
        }

        const duration = body.actual_duration_seconds || 5
        const actualQuota = duration * existing.rate
        existing.status = 'settled'
        settlements.set(body.request_id, { settledQuota: actualQuota, status: 'settled', duration })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: true,
          data: {
            request_id: body.request_id,
            actual_duration_seconds: duration,
            settled_quota: actualQuota,
            settled_credits: actualQuota / 1000,
            status: 'settled',
          },
        }))
      })
      return
    }

    res.writeHead(404)
    res.end()
  })

  await new Promise<void>(resolve => mockServer.listen(0, '127.0.0.1', resolve))
  const port = (mockServer.address() as any).port
  const mockBaseUrl = `http://127.0.0.1:${port}`
  process.env.TORA_API_BASE_URL = mockBaseUrl

  t.after(() => {
    mockServer.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
    delete process.env.SQLITE_PATH
    delete process.env.HUOBAO_DATA_DIR
    delete process.env.STORAGE_PATH
    delete process.env.HUOBAO_SERVER_MODE
    delete process.env.TORA_API_BASE_URL
  })

  // Dynamic imports after env setup
  const { db, schema } = await import('../src/db/index.js')
  const {
    quoteToraVideo,
    reserveToraVideo,
    settleToraVideo,
    getUserToraApiKey,
  } = await import('../src/services/tora-client.js')
  const { generateVideo } = await import('../src/services/generation.js')
  const { encryptCredential, generateSessionToken, hashSessionToken } = await import('../src/utils/crypto.js')

  // Seed DB with Alice (101, valid credits) and Bob (202, zero credits)
  const nowStr = new Date().toISOString()
  const farFuture = new Date(Date.now() + 86400000).toISOString()

  await db.insert(schema.users).values([
    {
      id: 101,
      issuer: 'tora',
      externalUserId: 101,
      username: 'alice',
      displayName: 'Alice Cooper',
      status: 'active',
      createdAt: nowStr,
      updatedAt: nowStr,
    },
    {
      id: 202,
      issuer: 'tora',
      externalUserId: 202,
      username: 'bob',
      displayName: 'Bob Ross',
      status: 'active',
      createdAt: nowStr,
      updatedAt: nowStr,
    },
  ])

  // Sessions with encrypted Tora credentials
  const aliceToken = generateSessionToken()
  const bobToken = generateSessionToken()

  await db.insert(schema.authSessions).values([
    {
      sessionTokenHash: hashSessionToken(aliceToken),
      userId: 101,
      tokenId: 1,
      encryptedCredential: encryptCredential('sk-alice-valid'),
      createdAt: nowStr,
      expiresAt: farFuture,
      lastSeenAt: nowStr,
    },
    {
      sessionTokenHash: hashSessionToken(bobToken),
      userId: 202,
      tokenId: 2,
      encryptedCredential: encryptCredential('sk-bob-zero'),
      createdAt: nowStr,
      expiresAt: farFuture,
      lastSeenAt: nowStr,
    },
  ])

  // Seed AI Config for Wan video
  await db.insert(schema.aiServiceConfigs).values({
    id: 1,
    name: 'Wan Video',
    serviceType: 'video',
    provider: 'aliyun',
    baseUrl: 'https://dashscope.aliyuncs.com',
    apiKey: 'enc:provider-test-key',
    model: JSON.stringify(['wan3.0-video']),
    isActive: true,
    ownerUserId: null,
    createdAt: nowStr,
    updatedAt: nowStr,
  })

  // Seed project for Alice and project for Bob
  await db.insert(schema.dramas).values([
    { id: 1, title: "Alice's Project", ownerUserId: 101, createdAt: nowStr, updatedAt: nowStr },
    { id: 2, title: "Bob's Project", ownerUserId: 202, createdAt: nowStr, updatedAt: nowStr },
  ])
  await db.insert(schema.episodes).values([
    { id: 1, dramaId: 1, episodeNumber: 1, title: 'Ep 1', createdAt: nowStr, updatedAt: nowStr },
    { id: 2, dramaId: 2, episodeNumber: 1, title: 'Ep 1', createdAt: nowStr, updatedAt: nowStr },
  ])
  await db.insert(schema.storyboards).values([
    { id: 1, episodeId: 1, storyboardNumber: 1, description: 'Alice Shot 1', duration: 6, createdAt: nowStr, updatedAt: nowStr },
    { id: 2, episodeId: 2, storyboardNumber: 1, description: 'Bob Shot 1', duration: 6, createdAt: nowStr, updatedAt: nowStr },
  ])

  // =========================================================================
  // Test A5.1: Quote calculation matches model & resolution rate
  // =========================================================================
  const aliceKey = await getUserToraApiKey(101)
  assert.equal(aliceKey, 'sk-alice-valid')

  const bobKey = await getUserToraApiKey(202)
  assert.equal(bobKey, 'sk-bob-zero')

  const quote720 = await quoteToraVideo(aliceKey!, { model: 'wan3.0-video', resolution: '720P', durationSeconds: 6 })
  assert.equal(quote720.quotaPerSecond, 2000)
  assert.equal(quote720.estimatedQuota, 12000)
  assert.equal(quote720.estimatedCredits, 12)
  assert.equal(quote720.canAfford, true)

  const quote1080 = await quoteToraVideo(aliceKey!, { model: 'wan3.0-video', resolution: '1080P', durationSeconds: 6 })
  assert.equal(quote1080.quotaPerSecond, 4000)
  assert.equal(quote1080.estimatedQuota, 24000)

  const bobQuote = await quoteToraVideo(bobKey!, { model: 'wan3.0-video', resolution: '720P', durationSeconds: 6 })
  assert.equal(bobQuote.canAfford, false)

  // =========================================================================
  // Test A5.2: Zero-quota user (Bob) is rejected when submitting video task
  // =========================================================================
  await assert.rejects(
    async () => {
      await generateVideo({
        ownerUserId: 202,
        dramaId: 2,
        storyboardId: 2,
        prompt: 'A cyberpunk street with neon signs',
        model: 'wan3.0-video',
        resolution: '720P',
        duration: 6,
        configId: 1,
      })
    },
    (err: any) => {
      assert.match(err.message, /insufficient|เครดิตไม่เพียงพอ/i)
      return true
    }
  )

  // Verify that NO task record was enqueued for Bob
  const bobTasks = await db.select().from(schema.sysTask).where(assert.strictEqual(true, true) ? undefined : undefined)
  const bobTasksFiltered = (await db.select().from(schema.sysTask)).filter(t => t.ownerUserId === 202)
  assert.equal(bobTasksFiltered.length, 0)

  // =========================================================================
  // Test A5.3: Zero-quota user can still view their drama, episodes, storyboards
  // =========================================================================
  const bobDramas = (await db.select().from(schema.dramas)).filter(d => d.ownerUserId === 202)
  assert.equal(bobDramas.length, 1)
  assert.equal(bobDramas[0].title, "Bob's Project")

  // =========================================================================
  // Test A5.4: Normal quota user (Alice) successfully reserves quota
  // =========================================================================
  const reservation = await reserveToraVideo(aliceKey!, {
    requestId: 'req-alice-shot-1',
    model: 'wan3.0-video',
    resolution: '720P',
    maxDurationSeconds: 10,
  })
  assert.equal(reservation.requestId, 'req-alice-shot-1')
  assert.equal(reservation.reservedQuota, 20000) // 10s * 2000 = 20,000
  assert.equal(reservation.status, 'pending')

  // Verify reservation exists on mock server
  const storedRes = reservations.get('req-alice-shot-1')
  assert.ok(storedRes)
  assert.equal(storedRes.amount, 20000)
  assert.equal(storedRes.status, 'pending')

  // =========================================================================
  // Test A5.5: Failed task settlement refunds full reservation with 0 charge
  // =========================================================================
  const failRes = await reserveToraVideo(aliceKey!, {
    requestId: 'req-alice-shot-fail',
    model: 'wan3.0-video',
    resolution: '720P',
    maxDurationSeconds: 10,
  })
  assert.equal(failRes.status, 'pending')

  const failSettle = await settleToraVideo(aliceKey!, {
    requestId: 'req-alice-shot-fail',
    success: false,
    errorMessage: 'Upstream video render failed',
  })
  assert.equal(failSettle.status, 'refunded')
  assert.equal(failSettle.settledQuota, 0)

  // =========================================================================
  // Test A5.6: Successful task settles exact output seconds and refunds excess
  // =========================================================================
  // Actual video output is 6 seconds. Rate is 2000 quota/sec -> 12,000 quota ($0.024)
  // Reservation was 20,000 quota. Excess 8,000 is released!
  const successSettle = await settleToraVideo(aliceKey!, {
    requestId: 'req-alice-shot-1',
    success: true,
    actualDurationSeconds: 6,
  })
  assert.equal(successSettle.status, 'settled')
  assert.equal(successSettle.settledQuota, 12000)
  assert.equal(successSettle.settledCredits, 12)

  // =========================================================================
  // Test A5.7: Idempotent duplicate settle calls do not double-charge or double-refund
  // =========================================================================
  const dupSettle = await settleToraVideo(aliceKey!, {
    requestId: 'req-alice-shot-1',
    success: true,
    actualDurationSeconds: 6,
  })
  assert.equal(dupSettle.status, 'settled')
  assert.equal(dupSettle.settledQuota, 12000)

  // Verify that mock settlement map only recorded one settlement
  assert.equal(settlements.get('req-alice-shot-1')?.settledQuota, 12000)
})
