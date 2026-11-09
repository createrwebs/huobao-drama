import type { Context, MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import { eq, and, isNull, gt } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { hashSessionToken, decryptCredential } from '../utils/crypto.js'

export interface AuthenticatedActor {
  userId: number
  issuer: string
  externalUserId: number
  username: string
  displayName: string
  sessionId: number
  tokenId: number
  apiKey?: string
  isLocal?: boolean
}

declare module 'hono' {
  interface ContextVariableMap {
    actor?: AuthenticatedActor
  }
}

/**
 * Returns true if running in server multi-user mode.
 */
export function isServerMode(): boolean {
  return process.env.HUOBAO_SERVER_MODE === 'true' || process.env.NODE_ENV === 'production'
}

/**
 * Resolves an active session from request cookie or Authorization header.
 */
export async function resolveSessionToken(c: Context): Promise<string | null> {
  // 1. Check HttpOnly cookie
  const cookieToken = getCookie(c, 'huobao_session')
  if (cookieToken) return cookieToken.trim()

  // 2. Check Authorization header
  const authHeader = c.req.header('Authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim()
    // Ignore if client sent a raw upstream sk- key as bearer here
    if (bearer) return bearer
  }

  // 3. Check X-Session-Token header
  const xSession = c.req.header('X-Session-Token')
  if (xSession) return xSession.trim()

  return null
}

/**
 * Resolves an AuthenticatedActor from the request.
 */
export async function resolveActor(c: Context): Promise<AuthenticatedActor | null> {
  const token = await resolveSessionToken(c)
  if (!token) return null

  const tokenHash = hashSessionToken(token)
  const nowIso = new Date().toISOString()

  // Find active, unrevoked, unexpired session
  const [session] = await db
    .select()
    .from(schema.authSessions)
    .where(
      and(
        eq(schema.authSessions.sessionTokenHash, tokenHash),
        isNull(schema.authSessions.revokedAt),
        gt(schema.authSessions.expiresAt, nowIso)
      )
    )
    .limit(1)

  if (!session) return null

  // Find active user
  const [user] = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.id, session.userId), eq(schema.users.status, 'active')))
    .limit(1)

  if (!user) return null

  let decryptedKey: string | undefined
  if (session.encryptedCredential) {
    try {
      decryptedKey = decryptCredential(session.encryptedCredential)
    } catch (e: any) {
      console.warn('Failed to decrypt session credential:', e?.message)
    }
  }

  return {
    userId: user.id,
    issuer: user.issuer,
    externalUserId: user.externalUserId,
    username: user.username || '',
    displayName: user.displayName || user.username || `User ${user.externalUserId}`,
    sessionId: session.id,
    tokenId: session.tokenId || 0,
    apiKey: decryptedKey,
  }
}

/**
 * Public routes that do not require authentication even in server mode.
 */
export const PUBLIC_ROUTES = [
  '/api/v1/health',
  '/api/v1/auth/login',
  '/api/v1/auth/me',
  '/api/v1/auth/logout',
  '/api/v1/worker/script',
  '/api/v1/worker/notebook',
  '/static',
  '/storyvdo/static',
]

/**
 * Authentication middleware:
 * - Attaches authenticated actor if valid session exists.
 * - In server mode, enforces authentication on non-public routes (401).
 * - In local mode, allows unauthenticated requests to proceed with null actor.
 */
export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const rawPath = c.req.path
  const path = rawPath.replace(/^\/storyvdo/, '') || '/'

  // Try resolving actor
  const actor = await resolveActor(c)
  if (actor) {
    c.set('actor', actor)
  }

  // Check worker token exemption
  const workerSecret = process.env.WORKER_SECRET_KEY || 'tora_colab_worker_secret_2026'
  const isWorkerAuth =
    (c.req.header('X-Worker-Token') === workerSecret ||
     c.req.query('token') === workerSecret) &&
    (path.includes('/api/v1/worker/') || path.includes('/worker/'))

  // Check if route is public
  const isPublicRoute = PUBLIC_ROUTES.some(p => path === p || path.startsWith(`${p}/`) || rawPath === p || rawPath.startsWith(`${p}/`))
  const isFrontendRoute = !path.startsWith('/api/') && !path.startsWith('/static/')

  const isPublic = isWorkerAuth || isPublicRoute || isFrontendRoute

  if (isServerMode() && !isPublic && !actor) {
    return c.json({ code: 401, message: 'Unauthorized. Please login with your Tora account.' }, 401)
  }

  await next()
}

/**
 * Helper to get current actor from context.
 */
export function getActor(c: Context): AuthenticatedActor | null {
  return c.get('actor') || null
}

/**
 * Helper that throws or returns current actor, requiring authentication.
 */
export function requireActor(c: Context): AuthenticatedActor {
  const actor = getActor(c)
  if (!actor) {
    throw Object.assign(new Error('Unauthorized. Login required.'), { status: 401 })
  }
  return actor
}
