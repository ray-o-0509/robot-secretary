export const MODELS = {
  geminiLive: 'gemini-3.1-flash-live-preview',
  geminiMemorySummarizer: 'gemini-2.5-flash-lite',
  claudeDelegate: 'claude-sonnet-4-6',
} as const

export const LIMITS = {
  claudeMaxIterations: 10,
  claudeMaxTokens: 4096,
  geminiMaxReconnectAttempts: 8,
} as const
