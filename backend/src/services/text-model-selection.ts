export function isModelAccessError(message: string): boolean {
  return /no access to model|model.*not found|model.*not available|unsupported model|does not have access/i.test(message)
}

export function getAllowedFallbackModels(models: readonly string[], requested?: string): string[] {
  return [...new Set(models)].filter(model => model !== requested).slice(0, 3)
}

export function resolveTextModelName(config: { model: string; availableModels?: string[] }, fileModel?: string, override?: string): string {
  if (config.availableModels) {
    if (override && !config.availableModels.includes(override)) throw new Error('Selected text model is not available for this ToraAPI key')
    if (override) return override
    if (fileModel && config.availableModels.includes(fileModel)) return fileModel
    return config.model
  }
  return override || fileModel || config.model
}
