import crypto from 'node:crypto'
import { eq, and, isNull, desc } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { decryptCredential } from '../utils/crypto.js'

export interface ToraIdentity {
  userId: number
  tokenId: number
  username: string
  displayName: string
  accountStatus: number
  tokenStatus: number
  expiresAt: number
  quota: number
}

export interface ToraCredits {
  userId: number
  tokenId: number
  tokenUnlimited: boolean
  tokenQuota: number
  userQuota: number
  spendableQuota: number
  spendableCredit: number
  quotaPerCredit: number
}

interface CacheEntry {
  identity: ToraIdentity
  expiresAt: number
}

// In-memory identity cache (max 60 seconds TTL)
const identityCache = new Map<string, CacheEntry>()

export function getToraBaseUrl(): string {
  return (process.env.TORA_API_BASE_URL || 'https://www.toraapi.com').replace(/\/+$/, '')
}

/**
 * Clears the in-memory identity cache (useful in tests or when revoking).
 */
export function clearToraCache(): void {
  identityCache.clear()
}

/**
 * Verifies a Tora API key against the New-API / Tora backend identity contract.
 */
export async function verifyToraIdentity(
  apiKey: string,
  options?: { baseUrl?: string; skipCache?: boolean }
): Promise<ToraIdentity> {
  const trimmedKey = (apiKey || '').trim()
  if (!trimmedKey) {
    throw new Error('API key is empty')
  }

  const cacheKey = crypto.createHash('sha256').update(trimmedKey).digest('hex')
  const nowMs = Date.now()

  if (!options?.skipCache) {
    const cached = identityCache.get(cacheKey)
    if (cached && cached.expiresAt > nowMs) {
      return cached.identity
    }
  }

  const baseUrl = (options?.baseUrl || getToraBaseUrl()).replace(/\/+$/, '')
  const endpoints = ['/api/huobao/identity', '/v1/huobao/identity']

  let lastError: Error | null = null

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(`${baseUrl}${endpoint}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${trimmedKey}`,
          Accept: 'application/json',
        },
      })

      if (res.status === 401) {
        let errJson: any = {}
        try { errJson = await res.json() } catch {}
        throw new Error(errJson.message || 'Tora API key is invalid or revoked (401)')
      }

      if (res.status === 403) {
        let errJson: any = {}
        try { errJson = await res.json() } catch {}
        throw new Error(errJson.message || 'Tora account is disabled or banned (403)')
      }

      if (!res.ok) {
        throw new Error(`Tora identity endpoint returned HTTP ${res.status}`)
      }

      const json = await res.json()
      const data = json?.data || json
      if (!json || !json.success || (!data?.user_id && !json?.user_id)) {
        throw new Error(json?.message || 'Invalid identity response from Tora')
      }

      const identity: ToraIdentity = {
        userId: Number(data.user_id || json.user_id),
        tokenId: Number(data.token_id || json.token_id || 0),
        username: String(data.username || json.username || ''),
        displayName: String(data.display_name || json.display_name || data.username || `User ${data.user_id || json.user_id}`),
        accountStatus: Number(data.account_status ?? json.account_status ?? 1),
        tokenStatus: Number(data.token_status ?? json.token_status ?? 1),
        expiresAt: Number(data.expires_at || json.expires_at || 0),
        quota: Number(data.quota || json.quota || 0),
      }

      // Cache valid identity for up to 60 seconds
      identityCache.set(cacheKey, {
        identity,
        expiresAt: nowMs + 60_000,
      })

      return identity
    } catch (err: any) {
      lastError = err
      // If 401 or 403, do not try next endpoint - token is definitively rejected
      if (err.message?.includes('401') || err.message?.includes('403')) {
        throw err
      }
    }
  }

  throw lastError || new Error('Failed to verify Tora identity')
}

/**
 * Retrieves credit information from Tora.
 */
export async function getToraCredits(
  apiKey: string,
  options?: { baseUrl?: string }
): Promise<ToraCredits> {
  const trimmedKey = (apiKey || '').trim()
  if (!trimmedKey) {
    throw new Error('API key is empty')
  }

  const baseUrl = (options?.baseUrl || getToraBaseUrl()).replace(/\/+$/, '')
  const endpoints = ['/api/huobao/credits', '/v1/huobao/credits']

  let lastError: Error | null = null

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(`${baseUrl}${endpoint}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${trimmedKey}`,
          Accept: 'application/json',
        },
      })

      if (!res.ok) {
        let errJson: any = {}
        try { errJson = await res.json() } catch {}
        throw new Error(errJson.message || `Tora credits endpoint returned HTTP ${res.status}`)
      }

      const json = await res.json()
      const data = json?.data || json
      if (!json || !json.success) {
        throw new Error(json?.message || 'Failed to retrieve Tora credits')
      }

      return {
        userId: Number(data.user_id || json.user_id),
        tokenId: Number(data.token_id || json.token_id || 0),
        tokenUnlimited: Boolean(data.unlimited_quota ?? data.token_unlimited ?? json.token_unlimited),
        tokenQuota: Number(data.token_quota ?? data.quota ?? json.token_quota ?? 0),
        userQuota: Number(data.user_quota ?? json.user_quota ?? 0),
        spendableQuota: Number(data.spendable_quota ?? json.spendable_quota ?? 0),
        spendableCredit: Number(data.spendable_credits ?? data.spendable_credit ?? json.spendable_credit ?? 0),
        quotaPerCredit: Number(data.quota_per_credit ?? json.quota_per_credit ?? 1000),
      }
    } catch (err: any) {
      lastError = err
    }
  }

  throw lastError || new Error('Failed to fetch Tora credits')
}

export interface ToraVideoQuote {
  model: string
  resolution: string
  durationSeconds: number
  quotaPerSecond: number
  creditPerSecond: number
  estimatedQuota: number
  estimatedCredits: number
  spendableQuota: number
  canAfford: boolean
}

export async function quoteToraVideo(
  apiKey: string,
  params: { model?: string; resolution?: string; durationSeconds?: number },
  options?: { baseUrl?: string }
): Promise<ToraVideoQuote> {
  const baseUrl = (options?.baseUrl || getToraBaseUrl()).replace(/\/+$/, '')
  const endpoints = ['/api/huobao/video/quote', '/v1/huobao/video/quote']
  let lastErr: Error | null = null

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${baseUrl}${ep}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          model: params.model || 'wan3.0-video',
          resolution: params.resolution || '720P',
          duration_seconds: params.durationSeconds || 5,
        }),
      })
      if (!res.ok) {
        let errJson: any = {}
        try { errJson = await res.json() } catch {}
        throw new Error(errJson.message || `Quote returned HTTP ${res.status}`)
      }
      const json = await res.json()
      const data = json?.data || json
      return {
        model: data.model,
        resolution: data.resolution,
        durationSeconds: Number(data.duration_seconds),
        quotaPerSecond: Number(data.quota_per_second),
        creditPerSecond: Number(data.credit_per_second),
        estimatedQuota: Number(data.estimated_quota),
        estimatedCredits: Number(data.estimated_credits),
        spendableQuota: Number(data.spendable_quota),
        canAfford: Boolean(data.can_afford),
      }
    } catch (err: any) {
      lastErr = err
    }
  }
  throw lastErr || new Error('Failed to quote video task')
}

export interface ToraVideoReservation {
  requestId: string
  model: string
  resolution: string
  maxDurationSeconds: number
  quotaPerSecond: number
  reservedQuota: number
  reservedCredits: number
  status: string
}

export async function reserveToraVideo(
  apiKey: string,
  params: { requestId: string; model?: string; resolution?: string; maxDurationSeconds?: number },
  options?: { baseUrl?: string }
): Promise<ToraVideoReservation> {
  const baseUrl = (options?.baseUrl || getToraBaseUrl()).replace(/\/+$/, '')
  const endpoints = ['/api/huobao/video/reserve', '/v1/huobao/video/reserve']
  let lastErr: Error | null = null

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${baseUrl}${ep}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          request_id: params.requestId,
          model: params.model || 'wan3.0-video',
          resolution: params.resolution || '720P',
          max_duration_seconds: params.maxDurationSeconds || 10,
        }),
      })
      if (res.status === 402) {
        let errJson: any = {}
        try { errJson = await res.json() } catch {}
        throw new Error(errJson.message || 'เครดิตไม่เพียงพอสำหรับสร้างวิดีโอ (402 Payment Required)')
      }
      if (!res.ok) {
        let errJson: any = {}
        try { errJson = await res.json() } catch {}
        throw new Error(errJson.message || `Reserve returned HTTP ${res.status}`)
      }
      const json = await res.json()
      const data = json?.data || json
      return {
        requestId: data.request_id,
        model: data.model,
        resolution: data.resolution,
        maxDurationSeconds: Number(data.max_duration_seconds),
        quotaPerSecond: Number(data.quota_per_second),
        reservedQuota: Number(data.reserved_quota),
        reservedCredits: Number(data.reserved_credits),
        status: data.status,
      }
    } catch (err: any) {
      lastErr = err
      if (err.message?.includes('402') || err.message?.includes('insufficient')) {
        throw err
      }
    }
  }
  throw lastErr || new Error('Failed to reserve video task')
}

export interface ToraVideoSettlement {
  requestId: string
  settledQuota: number
  settledCredits?: number
  actualDurationSeconds?: number
  status: string
}

export async function settleToraVideo(
  apiKey: string,
  params: { requestId: string; success: boolean; actualDurationSeconds?: number; errorMessage?: string },
  options?: { baseUrl?: string }
): Promise<ToraVideoSettlement> {
  const baseUrl = (options?.baseUrl || getToraBaseUrl()).replace(/\/+$/, '')
  const endpoints = ['/api/huobao/video/settle', '/v1/huobao/video/settle']
  let lastErr: Error | null = null

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${baseUrl}${ep}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          request_id: params.requestId,
          success: params.success,
          actual_duration_seconds: params.actualDurationSeconds || 0,
          error_message: params.errorMessage || '',
        }),
      })
      if (!res.ok) {
        let errJson: any = {}
        try { errJson = await res.json() } catch {}
        throw new Error(errJson.message || `Settle returned HTTP ${res.status}`)
      }
      const json = await res.json()
      const data = json?.data || json
      return {
        requestId: data.request_id,
        settledQuota: Number(data.settled_quota || 0),
        settledCredits: Number(data.settled_credits || 0),
        actualDurationSeconds: Number(data.actual_duration_seconds || 0),
        status: data.status,
      }
    } catch (err: any) {
      lastErr = err
    }
  }
  throw lastErr || new Error('Failed to settle video task')
}

/**
 * Retrieves and decrypts the active Tora API key for a given user.
 */
export async function getUserToraApiKey(userId: number): Promise<string | null> {
  const session = (
    await db
      .select()
      .from(schema.authSessions)
      .where(and(eq(schema.authSessions.userId, userId), isNull(schema.authSessions.revokedAt)))
      .orderBy(desc(schema.authSessions.id))
      .limit(1)
  )[0]

  if (!session || !session.encryptedCredential) {
    return null
  }

  try {
    return decryptCredential(session.encryptedCredential)
  } catch {
    return null
  }
}

