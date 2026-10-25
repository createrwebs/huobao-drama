/**
 * 从提示词中精确提取时间标记（秒数）
 * 严格支持多段提示词的时间区间：
 * 例如: 0-3s, 3-6s, 6-9s, 9-12s → 提取最大值 12 秒
 * 0-5s → 5 秒
 * 0-8秒 → 8 秒
 * 10-15s → 15 秒
 */
export function extractDurationFromPrompt(prompt: string | null | undefined): number | null {
  if (!prompt) return null
  const rangeMatches = [...prompt.matchAll(/(?:^|[^\d])(\d+)\s*[-~至到]\s*(\d+)\s*(?:s|sec|วินาที|秒)/gi)]
  if (rangeMatches.length > 0) {
    const endTimes = rangeMatches.map(m => parseInt(m[2], 10)).filter(n => !isNaN(n) && n > 0)
    if (endTimes.length > 0) return Math.max(...endTimes)
  }
  const singleMatches = [...prompt.matchAll(/(?:^|[^\d])(\d+)\s*(?:s|sec|วินาที|秒)(?:[^\w]|$)/gi)]
  if (singleMatches.length > 0) {
    const times = singleMatches.map(m => parseInt(m[1], 10)).filter(n => !isNaN(n) && n >= 2 && n <= 60)
    if (times.length > 0) return Math.max(...times)
  }
  return null
}
