import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DATA_ROOT } from './paths.js'

let cachedSecretKey: Buffer | null = null

/**
 * Gets or initializes the 256-bit encryption key used for server-side credential encryption.
 * Priority:
 * 1. process.env.HUOBAO_SECRET_KEY (must be 32 bytes or 64 hex characters)
 * 2. Persisted file in DATA_ROOT/.huobao_secret (auto-generated if missing)
 */
export function getEncryptionKey(): Buffer {
  if (cachedSecretKey) {
    return cachedSecretKey
  }

  const envKey = process.env.HUOBAO_SECRET_KEY
  if (envKey) {
    if (envKey.length === 64 && /^[0-9a-fA-F]+$/.test(envKey)) {
      cachedSecretKey = Buffer.from(envKey, 'hex')
      return cachedSecretKey
    }
    // SHA-256 digest of arbitrary length string
    cachedSecretKey = crypto.createHash('sha256').update(envKey).digest()
    return cachedSecretKey
  }

  const secretFilePath = path.join(DATA_ROOT, '.huobao_secret')
  try {
    if (fs.existsSync(secretFilePath)) {
      const fileContent = fs.readFileSync(secretFilePath, 'utf8').trim()
      if (fileContent.length === 64) {
        cachedSecretKey = Buffer.from(fileContent, 'hex')
        return cachedSecretKey
      }
    }
  } catch {}

  // Generate new 32-byte secret and persist safely
  const generatedKey = crypto.randomBytes(32)
  try {
    fs.mkdirSync(DATA_ROOT, { recursive: true })
    fs.writeFileSync(secretFilePath, generatedKey.toString('hex'), { mode: 0o600 })
  } catch {}

  cachedSecretKey = generatedKey
  return cachedSecretKey
}

/**
 * Generates an opaque high-entropy random token for browser session cookies.
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Hashes session token with SHA-256 for secure storage.
 */
export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * Encrypts sensitive credentials (such as Tora API keys) using AES-256-GCM.
 */
export function encryptCredential(plaintext: string, overrideKey?: Buffer): string {
  const key = overrideKey || getEncryptionKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':')
}

/**
 * Decrypts sensitive credentials encrypted with AES-256-GCM.
 */
export function decryptCredential(payload: string, overrideKey?: Buffer): string {
  const parts = payload.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted credential format')
  }

  const [ivB64, tagB64, cipherB64] = parts
  const key = overrideKey || getEncryptionKey()
  const iv = Buffer.from(ivB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const ciphertext = Buffer.from(cipherB64, 'base64')

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted.toString('utf8')
}

/**
 * Masks an API key for safe presentation in logs and API responses.
 * Never leaks the full key.
 */
export function maskApiKey(key?: string | null): string {
  if (!key) return ''
  const trimmed = key.trim()
  if (trimmed.length <= 8) return '********'
  const prefix = trimmed.startsWith('sk-') ? 'sk-...' : trimmed.slice(0, 3) + '...'
  const suffix = trimmed.slice(-4)
  return `${prefix}${suffix}`
}

/**
 * Signs a media file path with an expiration timestamp using HMAC-SHA256.
 * Allows external AI providers to fetch reference media securely without exposing media publicly.
 */
export function generateSignedMediaUrl(relativePath: string, expiresInSeconds = 3600): string {
  const normalized = relativePath.replace(/^\/+/, '')
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds
  const key = getEncryptionKey()
  const payload = `${normalized}:${exp}`
  const sig = crypto.createHmac('sha256', key).update(payload).digest('hex')
  const separator = relativePath.includes('?') ? '&' : '?'
  return `${relativePath}${separator}sig=${sig}&exp=${exp}`
}

/**
 * Verifies the HMAC-SHA256 signature of a signed media URL.
 */
export function verifySignedMediaUrl(relativePath: string, sig?: string, exp?: string): boolean {
  if (!sig || !exp) return false
  const expNum = Number(exp)
  if (!Number.isFinite(expNum) || Math.floor(Date.now() / 1000) > expNum) return false

  const normalized = relativePath.replace(/^\/+/, '')
  const key = getEncryptionKey()
  const payload = `${normalized}:${exp}`
  const expectedSig = crypto.createHmac('sha256', key).update(payload).digest('hex')

  if (sig.length !== expectedSig.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))
  } catch {
    return false
  }
}
