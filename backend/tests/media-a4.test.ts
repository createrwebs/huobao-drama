import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { Hono } from 'hono'

test('A4: Private Media Protection, Tenant Isolation, Range 206, and Provider Signed URLs', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'huobao-a4-test-'))
  const testDbPath = path.join(tmpDir, 'test.sqlite3')
  const testDataDir = path.join(tmpDir, 'data')
  const testStaticDir = path.join(testDataDir, 'static')
  fs.mkdirSync(testStaticDir, { recursive: true })

  process.env.SQLITE_PATH = testDbPath
  process.env.HUOBAO_DATA_DIR = testDataDir
  process.env.STORAGE_PATH = testStaticDir
  process.env.HUOBAO_SERVER_MODE = 'true'
  process.env.HUOBAO_DESKTOP = '0'

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    delete process.env.SQLITE_PATH
    delete process.env.HUOBAO_DATA_DIR
    delete process.env.STORAGE_PATH
    delete process.env.HUOBAO_SERVER_MODE
  })

  // Dynamic import of modules
  const { db, schema } = await import('../src/db/index.js')
  const { authMiddleware } = await import('../src/middleware/auth.js')
  const { handleAuthenticatedMedia } = await import('../src/utils/media-auth.js')
  const {
    generateSessionToken,
    hashSessionToken,
    encryptCredential,
    generateSignedMediaUrl,
  } = await import('../src/utils/crypto.js')

  // 1. Seed User A (101) and User B (102)
  const now = new Date().toISOString()
  const farFuture = new Date(Date.now() + 86400000).toISOString()

  await db.insert(schema.users).values([
    {
      id: 101,
      issuer: 'https://www.toraapi.com',
      externalUserId: 1,
      username: 'user_a',
      displayName: 'User A',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 102,
      issuer: 'https://www.toraapi.com',
      externalUserId: 2,
      username: 'user_b',
      displayName: 'User B',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
  ])

  // 2. Active sessions
  const tokenA = generateSessionToken()
  const tokenB = generateSessionToken()

  await db.insert(schema.authSessions).values([
    {
      sessionTokenHash: hashSessionToken(tokenA),
      userId: 101,
      tokenId: 11,
      encryptedCredential: encryptCredential('sk-userA'),
      createdAt: now,
      expiresAt: farFuture,
    },
    {
      sessionTokenHash: hashSessionToken(tokenB),
      userId: 102,
      tokenId: 22,
      encryptedCredential: encryptCredential('sk-userB'),
      createdAt: now,
      expiresAt: farFuture,
    },
  ])

  // 3. Create physical files on disk in testStaticDir
  const fileAContent = Buffer.from('FAKE-VIDEO-CONTENT-USER-A-0123456789ABCDEF-CINEMATIC')
  const fileBContent = Buffer.from('FAKE-VIDEO-CONTENT-USER-B-9876543210FEDCBA-CINEMATIC')
  const imageAContent = Buffer.from('FAKE-IMAGE-PNG-BYTES-USER-A')

  fs.mkdirSync(path.join(testStaticDir, 'videos'), { recursive: true })
  fs.mkdirSync(path.join(testStaticDir, 'images'), { recursive: true })

  fs.writeFileSync(path.join(testStaticDir, 'videos', 'videoA.mp4'), fileAContent)
  fs.writeFileSync(path.join(testStaticDir, 'videos', 'videoB.mp4'), fileBContent)
  fs.writeFileSync(path.join(testStaticDir, 'images', 'imageA.png'), imageAContent)

  // 4. Register ownership in assets / sys_task table
  await db.insert(schema.assets).values([
    {
      ownerUserId: 101,
      name: 'videoA.mp4',
      type: 'video',
      url: '/static/videos/videoA.mp4',
      localPath: 'videos/videoA.mp4',
      createdAt: now,
      updatedAt: now,
    },
    {
      ownerUserId: 101,
      name: 'imageA.png',
      type: 'image',
      url: '/static/images/imageA.png',
      localPath: 'images/imageA.png',
      createdAt: now,
      updatedAt: now,
    },
    {
      ownerUserId: 102,
      name: 'videoB.mp4',
      type: 'video',
      url: '/static/videos/videoB.mp4',
      localPath: 'videos/videoB.mp4',
      createdAt: now,
      updatedAt: now,
    },
  ])

  // 5. Setup test Hono app with authMiddleware and handleAuthenticatedMedia
  const app = new Hono()
  app.use('*', authMiddleware)
  app.all('/static/*', handleAuthenticatedMedia)

  const headersA = { Authorization: `Bearer ${tokenA}` }
  const headersB = { Authorization: `Bearer ${tokenB}` }

  // --- Test Case 1: Unauthenticated requests in server mode are rejected (401) ---
  const unauthRes = await app.request('/static/videos/videoA.mp4')
  assert.equal(unauthRes.status, 401)

  const unauthImgRes = await app.request('/static/images/imageA.png')
  assert.equal(unauthImgRes.status, 401)

  // --- Test Case 2: Cross-tenant probing returns 404 (no leak) ---
  const crossProbeRes = await app.request('/static/videos/videoA.mp4', { headers: headersB })
  assert.equal(crossProbeRes.status, 404)

  const crossImgProbeRes = await app.request('/static/images/imageA.png', { headers: headersB })
  assert.equal(crossImgProbeRes.status, 404)

  // --- Test Case 3: Owner A accesses own files successfully ---
  const ownerImgRes = await app.request('/static/images/imageA.png', { headers: headersA })
  assert.equal(ownerImgRes.status, 200)
  assert.equal(ownerImgRes.headers.get('Content-Type'), 'image/png')
  assert.equal(ownerImgRes.headers.get('Cache-Control'), 'private, max-age=3600')
  const imgBytes = Buffer.from(await ownerImgRes.arrayBuffer())
  assert.deepEqual(imgBytes, imageAContent)

  // --- Test Case 4: Video streaming with Range 206 for Owner A ---
  const rangeRes = await app.request('/static/videos/videoA.mp4', {
    headers: { ...headersA, Range: 'bytes=0-10' },
  })
  assert.equal(rangeRes.status, 206)
  assert.equal(rangeRes.headers.get('Content-Type'), 'video/mp4')
  assert.equal(rangeRes.headers.get('Accept-Ranges'), 'bytes')
  assert.equal(rangeRes.headers.get('Content-Range'), `bytes 0-10/${fileAContent.length}`)
  assert.equal(rangeRes.headers.get('Cache-Control'), 'private, max-age=3600')
  const rangeBytes = Buffer.from(await rangeRes.arrayBuffer())
  assert.deepEqual(rangeBytes, fileAContent.subarray(0, 11))

  // --- Test Case 5: Provider Signed URL allows external provider without bearer session ---
  const signedPath = generateSignedMediaUrl('/static/images/imageA.png', 3600)
  const signedRes = await app.request(signedPath)
  assert.equal(signedRes.status, 200)
  assert.equal(signedRes.headers.get('Content-Type'), 'image/png')

  // Expired / tampered signed URL is rejected
  const tamperedPath = `${signedPath}tampered`
  const tamperedRes = await app.request(tamperedPath)
  assert.equal(tamperedRes.status, 401)

  // --- Test Case 6: Directory traversal attempt is blocked ---
  const traversalRes = await app.request('/static/../package.json', { headers: headersA })
  assert.ok([403, 404].includes(traversalRes.status))
})
