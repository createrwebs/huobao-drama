import { Hono } from 'hono'
import { setCookie, deleteCookie } from 'hono/cookie'
import { eq, and } from 'drizzle-orm'
import { db, schema, getInsertId } from '../db/index.js'
import {
  generateSessionToken,
  hashSessionToken,
  encryptCredential,
  maskApiKey,
} from '../utils/crypto.js'
import { verifyToraIdentity, getToraCredits } from '../services/tora-client.js'
import { getActor, isServerMode, resolveSessionToken } from '../middleware/auth.js'
import { now } from '../utils/response.js'

const auth = new Hono()

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 days

/**
 * POST /login - Authenticate with Tora API key
 */
auth.post('/login', async (c) => {
  let body: any
  try {
    body = await c.req.json()
  } catch {
    return c.json({ code: 400, message: 'Invalid JSON body' }, 400)
  }

  const rawKey = body?.apiKey || body?.key || body?.token || body?.api_key
  if (!rawKey || typeof rawKey !== 'string' || !rawKey.trim()) {
    return c.json({ code: 400, message: 'Tora API key is required' }, 400)
  }

  const apiKey = rawKey.trim()

  // 1. Verify identity contract with Tora/New-API
  let identity: Awaited<ReturnType<typeof verifyToraIdentity>>
  try {
    identity = await verifyToraIdentity(apiKey)
  } catch (err: any) {
    const status = err.message?.includes('403') ? 403 : 401
    return c.json({ code: status, message: err.message || 'Authentication failed' }, status)
  }

  // 2. Upsert user in database
  const issuer = 'tora'
  const ts = now()

  let user = (
    await db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.issuer, issuer), eq(schema.users.externalUserId, identity.userId)))
      .limit(1)
  )[0]

  if (!user) {
    const insertRes = db
      .insert(schema.users)
      .values({
        issuer,
        externalUserId: identity.userId,
        username: identity.username || `user_${identity.userId}`,
        displayName: identity.displayName || identity.username || `User ${identity.userId}`,
        status: 'active',
        createdAt: ts,
        updatedAt: ts,
      })
      .run()

    const newId = getInsertId(insertRes)
    user = (
      await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, newId))
        .limit(1)
    )[0]
  } else {
    // Update existing user display info if changed
    db.update(schema.users)
      .set({
        username: identity.username || user.username,
        displayName: identity.displayName || user.displayName,
        updatedAt: ts,
      })
      .where(eq(schema.users.id, user.id))
      .run()
  }

  // 3. Create server-side session
  const sessionToken = generateSessionToken()
  const tokenHash = hashSessionToken(sessionToken)
  const encryptedKey = encryptCredential(apiKey)
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString()

  db.insert(schema.authSessions)
    .values({
      sessionTokenHash: tokenHash,
      userId: user.id,
      tokenId: identity.tokenId,
      encryptedCredential: encryptedKey,
      createdAt: ts,
      expiresAt,
      lastSeenAt: ts,
    })
    .run()

  // 4. Set HttpOnly session cookie
  const isSecure = process.env.NODE_ENV === 'production' || c.req.url.startsWith('https:')
  setCookie(c, 'huobao_session', sessionToken, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })

  // 5. Query credits
  let creditsData = null
  try {
    creditsData = await getToraCredits(apiKey)
  } catch (err: any) {
    console.warn('Could not fetch initial credits from Tora:', err?.message)
  }

  return c.json({
    code: 200,
    data: {
      user: {
        id: user.id,
        externalUserId: user.externalUserId,
        issuer: user.issuer,
        username: user.username,
        displayName: user.displayName,
      },
      token: {
        id: identity.tokenId,
        maskedKey: maskApiKey(apiKey),
        expiresAt: identity.expiresAt,
      },
      credits: creditsData,
      sessionToken, // Also provided in payload for clients that cannot use cookies
    },
  })
})

/**
 * GET /me - Current authenticated user & credit balance
 */
auth.get('/me', async (c) => {
  const actor = getActor(c)

  if (!actor) {
    if (isServerMode()) {
      return c.json({ code: 401, message: 'Unauthorized' }, 401)
    }
    return c.json({
      code: 200,
      data: {
        user: null,
        isAuthenticated: false,
        isServerMode: false,
      },
    })
  }

  let creditsData = null
  if (actor.apiKey) {
    try {
      creditsData = await getToraCredits(actor.apiKey)
    } catch (err: any) {
      console.warn('Failed to refresh credits in /me:', err?.message)
    }
  }

  return c.json({
    code: 200,
    data: {
      user: {
        id: actor.userId,
        externalUserId: actor.externalUserId,
        issuer: actor.issuer,
        username: actor.username,
        displayName: actor.displayName,
      },
      token: {
        id: actor.tokenId,
        maskedKey: maskApiKey(actor.apiKey),
      },
      credits: creditsData,
      isAuthenticated: true,
      isServerMode: isServerMode(),
    },
  })
})

/**
 * POST /logout - Revoke session and clear cookie
 */
auth.post('/logout', async (c) => {
  const token = await resolveSessionToken(c)
  if (token) {
    const tokenHash = hashSessionToken(token)
    db.update(schema.authSessions)
      .set({ revokedAt: now() })
      .where(eq(schema.authSessions.sessionTokenHash, tokenHash))
      .run()
  }

  deleteCookie(c, 'huobao_session', { path: '/' })

  return c.json({
    code: 200,
    message: 'Logged out successfully',
  })
})

export default auth
