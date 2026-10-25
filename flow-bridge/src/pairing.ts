import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';

export interface PairingStore {
  load(): Promise<string | null>;
  save(token: string): Promise<void>;
  reset(): Promise<void>;
}

export class FilePairingStore implements PairingStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<string | null> {
    try {
      const raw = JSON.parse(await readFile(this.filePath, 'utf8')) as { token?: unknown };
      return typeof raw.token === 'string' && raw.token.length >= 32 ? raw.token : null;
    } catch {
      return null;
    }
  }

  async save(token: string): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify({ token })}\n`, { mode: 0o600 });
  }

  async reset(): Promise<void> {
    const { unlink } = await import('node:fs/promises');
    await unlink(this.filePath).catch(() => undefined);
  }
}

export class MemoryPairingStore implements PairingStore {
  constructor(private token: string | null = null) {}

  async load(): Promise<string | null> {
    return this.token;
  }

  async save(token: string): Promise<void> {
    this.token = token;
  }

  async reset(): Promise<void> {
    this.token = null;
  }
}

export function createPairingToken(): string {
  return randomBytes(32).toString('base64url');
}

export function tokensEqual(actual: string | null | undefined, expected: string | null | undefined): boolean {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}