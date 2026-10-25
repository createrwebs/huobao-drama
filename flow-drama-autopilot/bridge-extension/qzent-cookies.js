/** Cookie shape accepted by qzent-flow2api/src/services/flow_web.py. */
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

export function toQzentCookieArray(cookies) {
  const seen = new Set();
  const result = [];

  for (const cookie of Array.isArray(cookies) ? cookies : []) {
    if (!cookie || !QZENT_COOKIE_DOMAINS.has(String(cookie.domain || ''))) continue;
    if (!QZENT_COOKIE_NAMES.has(String(cookie.name || ''))) continue;
    if (String(cookie.path || '/') !== '/') continue;

    const value = String(cookie.value || '');
    if (!value || /[\r\n;\x00]/.test(value)) continue;

    const key = `${cookie.domain}\t${cookie.name}\t/`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Keep the JSON intentionally small and compatible with qzent's parser.
    result.push({
      name: String(cookie.name),
      value,
      domain: String(cookie.domain),
      path: '/',
      secure: true,
    });
  }

  return result;
}

export function validateQzentCookieArray(cookies) {
  const normalized = toQzentCookieArray(cookies);
  const hasSession = normalized.some((cookie) =>
    ['SID', '__Secure-1PSID', '__Secure-3PSID'].includes(cookie.name));

  if (!normalized.length) {
    throw new Error('ไม่พบ Google Flow cookies ที่ qzent รองรับ');
  }
  if (!hasSession) {
    throw new Error('ไม่พบ cookie session สำคัญ (SID หรือ __Secure-1PSID/3PSID)');
  }
  return normalized;
}