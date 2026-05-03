export const STORAGE_KEYS = {
  geminiApiKey: 'GEMINI_API_KEY',
  languageCode: 'LANGUAGE_CODE',
} as const

const safeStorage = (): Storage | null =>
  typeof localStorage !== 'undefined' ? localStorage : null

export function getGeminiApiKey(): string {
  return safeStorage()?.getItem(STORAGE_KEYS.geminiApiKey)?.trim() ?? ''
}

export function setGeminiApiKey(value: string): void {
  const ls = safeStorage()
  if (!ls) return
  const trimmed = value.trim()
  if (trimmed) ls.setItem(STORAGE_KEYS.geminiApiKey, trimmed)
  else ls.removeItem(STORAGE_KEYS.geminiApiKey)
}

export function getLanguageCode(fallback = 'ja-JP'): string {
  return safeStorage()?.getItem(STORAGE_KEYS.languageCode) ?? fallback
}

export function setLanguageCode(code: string): void {
  safeStorage()?.setItem(STORAGE_KEYS.languageCode, code)
}
