import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export interface R2Config {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucketName: string
  endpoint: string
  publicDomain?: string
}

export function getR2Config(): R2Config {
  return {
    accountId: process.env.R2_ACCOUNT_ID || '7b45cc55a0d93df72bdfdfe302f2eafd',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '2d40908e43c49d68fca4437c0c8b5d17',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || 'ef786e8cbebf7081d49b670e6cadee789c6430be72a9ef713558cbfb08de1df2',
    bucketName: process.env.R2_BUCKET_NAME || process.env.R2_BUCKET || 'vdo',
    endpoint: process.env.R2_ENDPOINT || 'https://7b45cc55a0d93df72bdfdfe302f2eafd.r2.cloudflarestorage.com',
    publicDomain: process.env.R2_PUBLIC_DOMAIN || undefined,
  }
}

let _cachedS3Client: S3Client | null = null

export function getR2Client(): S3Client {
  if (_cachedS3Client) return _cachedS3Client
  const config = getR2Config()
  _cachedS3Client = new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
  })
  return _cachedS3Client
}

/**
 * Upload a raw Buffer or string to Cloudflare R2
 */
export async function uploadBufferToR2(
  key: string,
  buffer: Buffer | Uint8Array | string,
  contentType = 'application/octet-stream',
): Promise<string> {
  const client = getR2Client()
  const config = getR2Config()
  const cleanKey = key.replace(/^\/+/, '')

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: cleanKey,
      Body: typeof buffer === 'string' ? Buffer.from(buffer) : buffer,
      ContentType: contentType,
    }),
  )

  return getR2ObjectUrl(cleanKey)
}

/**
 * Generate a pre-signed PUT URL for direct client/worker upload
 */
export async function getPresignedR2UploadUrl(
  key: string,
  contentType = 'video/mp4',
  expiresInSeconds = 3600,
): Promise<string> {
  const client = getR2Client()
  const config = getR2Config()
  const cleanKey = key.replace(/^\/+/, '')

  const command = new PutObjectCommand({
    Bucket: config.bucketName,
    Key: cleanKey,
    ContentType: contentType,
  })

  return await getSignedUrl(client, command, { expiresIn: expiresInSeconds })
}

/**
 * Generate a pre-signed GET URL for downloading an object
 */
export async function getPresignedR2DownloadUrl(
  key: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const client = getR2Client()
  const config = getR2Config()
  const cleanKey = key.replace(/^\/+/, '')

  const command = new GetObjectCommand({
    Bucket: config.bucketName,
    Key: cleanKey,
  })

  return await getSignedUrl(client, command, { expiresIn: expiresInSeconds })
}

/**
 * Get object metadata from R2
 */
export async function getR2ObjectHead(key: string) {
  const client = getR2Client()
  const config = getR2Config()
  const cleanKey = key.replace(/^\/+/, '')

  return await client.send(
    new HeadObjectCommand({
      Bucket: config.bucketName,
      Key: cleanKey,
    }),
  )
}

/**
 * Get readable stream from R2 with optional HTTP Range
 */
export async function getR2ObjectStream(key: string, range?: string) {
  const client = getR2Client()
  const config = getR2Config()
  const cleanKey = key.replace(/^\/+/, '')

  return await client.send(
    new GetObjectCommand({
      Bucket: config.bucketName,
      Key: cleanKey,
      Range: range,
    }),
  )
}

/**
 * Returns public or playback URL for an R2 key
 */
export function getR2ObjectUrl(key: string): string {
  const cleanKey = key.replace(/^\/+/, '')
  const config = getR2Config()
  if (config.publicDomain) {
    return `${config.publicDomain.replace(/\/+$/, '')}/${cleanKey}`
  }
  // Fallback to internal streaming proxy route
  return `/api/v1/worker/r2-stream?key=${encodeURIComponent(cleanKey)}`
}
