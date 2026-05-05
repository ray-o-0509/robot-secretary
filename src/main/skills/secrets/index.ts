export const SECRET_KEYS = [
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'TICKTICK_ACCESS_TOKEN',
  'TURSO_DATABASE_URL',
  'TURSO_AUTH_TOKEN',
  'TAVILY_API_KEY',
] as const

export type SecretKey = (typeof SECRET_KEYS)[number]

export function getSecretSync(key: SecretKey): string | undefined {
  const value = process.env[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}
