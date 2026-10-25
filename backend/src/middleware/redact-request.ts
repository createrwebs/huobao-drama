/** Redact structured request bodies before logging or truncating them. */
export function redactRequestBody(text: string): string {
  try {
    const parsed = JSON.parse(text)
    return JSON.stringify(parsed, (key, value) =>
      /api.?key|password|token|secret|cookie|authorization|credential|^at$|^fsid$/i.test(key) ? '[REDACTED]' : value,
    )
  } catch {
    return '[non-JSON body omitted]'
  }
}
