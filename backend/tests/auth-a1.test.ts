import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { Hono } from 'hono'
import * as schema from '../src/db/schema.js'
import { initSqliteSchema } from '../src/db/sqlite-schema.js'
import {
  generateSessionToken,
  hashSessionToken,
  encryptCredential,
  decryptCredential,
  maskApiKey,
} from '../src/utils/crypto.js'
import { verifyToraIdentity, clearToraCache } from '../src/services/tora-client.js'

test('A1.1: Crypto utilities provide secure tokens, encryption and masking', () => {
  // 1. Session token generation
  const token1 = generateSessionToken()
  const token2 = generateSessionToken()
  assert.notEqual(token1, token2)
  assert.equal(token1.length, 64)

  // 2. Token hashing
  const hash1 = hashSessionToken(token1)
  const hash2 = hashSessionToken(token1)
  assert.equal(hash1, hash2)
  assert.notEqual(hash1, token1)
  assert.equal(hash1.length, 64)

  // 3. Credential encryption / decryption
  const secretKey = 'sk-tora-test-super-secret-key-123456789'
  const encrypted = encryptCredential(secretKey)
  assert.notEqual(encrypted, secretKey)
  assert.match(encrypted, /^.+:.+:.+$/) // iv:tag:ciphertext

  const decrypted = decryptCredential(encrypted)
  assert.equal(decrypted, secretKey)

  // Tampered ciphertext must fail decryption
  assert.throws(() => {
    const parts = encrypted.split(':')
    const tamperedCipher = Buffer.from(parts[2], 'base64')
    tamperedCipher[0] = tamperedCipher[0] ^ 0xff
    decryptCredential([parts[0], parts[1], tamperedCipher.toString('base64')].join(':'))
  })

  // 4. API Key masking
  assert.equal(maskApiKey('sk-1234567890abcdef'), 'sk-...cdef')
  assert.equal(maskApiKey('short'), '********')
  assert.equal(maskApiKey(''), '')
  assert.equal(maskApiKey(null), '')
})

test('A1.2: Tora verification contract, caching, and account separation', async (t) => {
  clearToraCache()

  // Mock Tora Server
  const mockServer = http.createServer((req, res) => {
    const authHeader = req.headers['authorization'] || ''
    const key = authHeader.replace(/^Bearer\s+/, '').trim()

    if (req.url === '/api/huobao/identity' || req.url === '/v1/huobao/identity') {
      if (key === 'sk-userA-key1' || key === 'sk-userA-key2') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: true,
          user_id: 101,
          token_id: key === 'sk-userA-key1' ? 1 : 2,
          username: 'alice',
          display_name: 'Alice Cooper',
          account_status: 1,
          token_status: 1,
          expires_at: 0,
          quota: 5000000,
        }))
        return
      }

      if (key === 'sk-userB-key1') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: true,
          user_id: 202,
          token_id: 10,
          username: 'bob',
          display_name: 'Bob Ross',
          account_status: 1,
          token_status: 1,
          expires_at: 0,
          quota: 2000000,
        }))
        return
      }

      if (key === 'sk-zero-quota') {
        // Zero quota allows identity login
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: true,
          user_id: 303,
          token_id: 15,
          username: 'charlie_empty',
          display_name: 'Charlie Zero',
          account_status: 1,
          token_status: 1,
          expires_at: 0,
          quota: 0,
        }))
        return
      }

      if (key === 'sk-banned') {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: false,
          message: 'User account is disabled or banned',
        }))
        return
      }

      // Default invalid key
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        success: false,
        message: 'Invalid or revoked token',
      }))
      return
    }

    if (req.url === '/api/huobao/credits' || req.url === '/v1/huobao/credits') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        success: true,
        user_id: 101,
        token_id: 1,
        token_unlimited: false,
        token_quota: 5000000,
        user_quota: 5000000,
        spendable_quota: 5000000,
        spendable_credit: 5000,
        quota_per_credit: 1000,
      }))
      return
    }

    res.writeHead(404)
    res.end()
  })

  await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', () => resolve()))
  const address = mockServer.address() as any
  const baseUrl = `http://127.0.0.1:${address.port}`

  t.after(() => {
    mockServer.close()
    clearToraCache()
  })

  // 1. Verify User A with Key 1
  const idA1 = await verifyToraIdentity('sk-userA-key1', { baseUrl, skipCache: true })
  assert.equal(idA1.userId, 101)
  assert.equal(idA1.username, 'alice')

  // 2. Verify User A with Key 2 -> Same user_id 101
  const idA2 = await verifyToraIdentity('sk-userA-key2', { baseUrl, skipCache: true })
  assert.equal(idA2.userId, 101)

  // 3. Verify User B -> user_id 202
  const idB = await verifyToraIdentity('sk-userB-key1', { baseUrl, skipCache: true })
  assert.equal(idB.userId, 202)
  assert.equal(idB.username, 'bob')

  // 4. Verify Zero Quota -> logs in successfully
  const idZero = await verifyToraIdentity('sk-zero-quota', { baseUrl, skipCache: true })
  assert.equal(idZero.userId, 303)
  assert.equal(idZero.quota, 0)

  // 5. Banned user fails with 403
  await assert.rejects(
    async () => verifyToraIdentity('sk-banned', { baseUrl, skipCache: true }),
    /403|banned/i
  )

  // 6. Invalid token fails with 401
  await assert.rejects(
    async () => verifyToraIdentity('sk-invalid-nonexistent', { baseUrl, skipCache: true }),
    /401|invalid/i
  )
})

test('A1.3: End-to-end auth routes (login, me, logout, cookies, and session lifecycle)', async (t) => {
  clearToraCache()

  // Create isolated temp SQLite database
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'huobao-auth-test-'))
  const testDbPath = path.join(tempDir, 'test.sqlite3')
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }))

  const sqlite = new Database(testDbPath)
  initSqliteSchema(sqlite)
  const testDb = drizzle(sqlite, { schema })

  // Spin up mock Tora server
  const mockServer = http.createServer((req, res) => {
    const authHeader = req.headers['authorization'] || ''
    const key = authHeader.replace(/^Bearer\s+/, '').trim()

    if (req.url === '/api/huobao/identity' || req.url === '/v1/huobao/identity') {
      if (key === 'sk-alice-1' || key === 'sk-alice-2') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: true,
          user_id: 888,
          token_id: key === 'sk-alice-1' ? 101 : 102,
          username: 'alice_adventures',
          display_name: 'Alice in Wonderland',
          account_status: 1,
          token_status: 1,
          expires_at: 0,
          quota: 10000000,
        }))
        return
      }
      if (key === 'sk-bob-1') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: true,
          user_id: 999,
          token_id: 201,
          username: 'bob_builder',
          display_name: 'Bob the Builder',
          account_status: 1,
          token_status: 1,
          expires_at: 0,
          quota: 5000000,
        }))
        return
      }
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, message: 'Invalid token' }))
      return
    }

    if (req.url === '/api/huobao/credits' || req.url === '/v1/huobao/credits') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        success: true,
        user_id: 888,
        token_id: 101,
        token_unlimited: false,
        token_quota: 10000000,
        user_quota: 10000000,
        spendable_quota: 10000000,
        spendable_credit: 10000,
        quota_per_credit: 1000,
      }))
      return
    }

    res.writeHead(404).end()
  })

  await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', () => resolve()))
  const address = mockServer.address() as any
  const toraBase = `http://127.0.0.1:${address.port}`
  process.env.TORA_API_BASE_URL = toraBase
  process.env.SQLITE_PATH = testDbPath
  process.env.HUOBAO_SERVER_MODE = 'true'

  t.after(() => {
    mockServer.close()
    delete process.env.TORA_API_BASE_URL
    delete process.env.SQLITE_PATH
    delete process.env.HUOBAO_SERVER_MODE
  })

  // Dynamic import of app to ensure DB and env are bound
  const { default: authRoute } = await import('../src/routes/auth.js')
  const { authMiddleware } = await import('../src/middleware/auth.js')

  const app = new Hono()
  app.use('*', authMiddleware)
  app.route('/api/v1/auth', authRoute)
  app.get('/api/v1/protected-data', (c) => c.json({ ok: true, actor: c.get('actor') }))

  // 1. Missing API key returns 400
  const badLogin = await app.request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  assert.equal(badLogin.status, 400)

  // 2. Invalid key returns 401
  const invalidLogin = await app.request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: 'sk-nonexistent' }),
  })
  assert.equal(invalidLogin.status, 401)

  // 3. User A logs in with key 1
  const loginRes1 = await app.request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: 'sk-alice-1' }),
  })
  assert.equal(loginRes1.status, 200)
  const setCookieHeader = loginRes1.headers.get('set-cookie') || ''
  assert.match(setCookieHeader, /huobao_session=/)
  assert.match(setCookieHeader, /HttpOnly/i)
  assert.match(setCookieHeader, /SameSite=Lax/i)

  const loginData1 = await loginRes1.json()
  assert.equal(loginData1.code, 200)
  assert.equal(loginData1.data.user.externalUserId, 888)
  assert.equal(loginData1.data.user.username, 'alice_adventures')
  assert.equal(loginData1.data.token.maskedKey, 'sk-...ce-1')
  // Verify NO raw key is returned anywhere in response
  assert.equal(JSON.stringify(loginData1).includes('sk-alice-1'), false)

  const cookieToken1 = setCookieHeader.split(';')[0]
  const sessionToken1 = loginData1.data.sessionToken
  assert.ok(sessionToken1)

  // 4. Access protected route with cookie
  const protectedRes = await app.request('/api/v1/protected-data', {
    headers: { Cookie: cookieToken1 },
  })
  assert.equal(protectedRes.status, 200)
  const protectedJson = await protectedRes.json()
  assert.equal(protectedJson.actor.externalUserId, 888)

  // 5. Access /me with session
  const meRes = await app.request('/api/v1/auth/me', {
    headers: { Cookie: cookieToken1 },
  })
  assert.equal(meRes.status, 200)
  const meJson = await meRes.json()
  assert.equal(meJson.data.user.externalUserId, 888)
  assert.equal(meJson.data.isAuthenticated, true)
  assert.ok(meJson.data.credits)

  // 6. User A logs in with key 2 (key rotation)
  const loginRes2 = await app.request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: 'sk-alice-2' }),
  })
  assert.equal(loginRes2.status, 200)
  const loginData2 = await loginRes2.json()
  // Must map to the exact same local user ID
  assert.equal(loginData2.data.user.id, loginData1.data.user.id)
  assert.equal(loginData2.data.user.externalUserId, 888)

  // 7. User B logs in
  const loginResB = await app.request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: 'sk-bob-1' }),
  })
  assert.equal(loginResB.status, 200)
  const loginDataB = await loginResB.json()
  assert.notEqual(loginDataB.data.user.id, loginData1.data.user.id)
  assert.equal(loginDataB.data.user.externalUserId, 999)

  // 8. Logout revokes session
  const logoutRes = await app.request('/api/v1/auth/logout', {
    method: 'POST',
    headers: { Cookie: cookieToken1 },
  })
  assert.equal(logoutRes.status, 200)
  const logoutCookie = logoutRes.headers.get('set-cookie') || ''
  assert.match(logoutCookie, /huobao_session=.*Max-Age=0/)

  // 9. After logout, session token 1 must be rejected with 401
  const afterLogoutRes = await app.request('/api/v1/auth/me', {
    headers: { Cookie: cookieToken1 },
  })
  assert.equal(afterLogoutRes.status, 401)

  // 10. Forged / non-existent session token must be rejected with 401
  const forgedRes = await app.request('/api/v1/auth/me', {
    headers: { Cookie: 'huobao_session=forged_token_1234567890abcdef' },
  })
  assert.equal(forgedRes.status, 401)
})
