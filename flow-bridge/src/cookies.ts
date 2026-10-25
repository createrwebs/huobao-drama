import type { ChromeCookie, QzentCookie } from './types.js';

export const QZENT_COOKIE_DOMAINS = new Set([
  'google.com',
  '.google.com',
  'flow.google.com',
  '.flow.google.com',
]);

export const QZENT_COOKIE_NAMES = new Set([
  'SID', 'HSID', 'SSID', 'APISID', 'SAPISID', 'NID', 'OSID', '__Secure-OSID',
  '__Secure-1PSID', '__Secure-3PSID', '__Secure-1PAPISID', '__Secure-3PAPISID',
  'SIDCC', '__Secure-1PSIDCC', '__Secure-3PSIDCC',
  '__Secure-1PSIDTS', '__Secure-3PSIDTS',
]);

export function toQzentCookieArray(cookies: readonly ChromeCookie[]): QzentCookie[] {
  const result: QzentCookie[] = [];
  const seen = new Set<string>();

  for (const cookie of cookies) {
    const domain = String(cookie.domain || '');
    const name = String(cookie.name || '');
    const value = String(cookie.value || '');
    const path = String(cookie.path || '/');
    if (!QZENT_COOKIE_DOMAINS.has(domain)) continue;
    if (!QZENT_COOKIE_NAMES.has(name)) continue;
    if (path !== '/' || !value || /[\r\n;\x00]/.test(value)) continue;

    const key = `${domain}\t${name}\t/`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ name, value, domain, path: '/', secure: true });
  }

  return result;
}

export function validateQzentCookieArray(cookies: readonly ChromeCookie[]): QzentCookie[] {
  const normalized = toQzentCookieArray(cookies);
  if (normalized.length === 0) {
    throw new Error('No supported Google Flow cookies were received');
  }
  const hasSession = normalized.some(({ name }) =>
    name === 'SID' || name === '__Secure-1PSID' || name === '__Secure-3PSID',
  );
  if (!hasSession) {
    throw new Error('Required Google session cookie is missing');
  }
  return normalized;
}