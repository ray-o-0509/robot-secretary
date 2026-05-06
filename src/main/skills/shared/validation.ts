export function asRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object') throw new Error('args must be an object')
  return input as Record<string, unknown>
}

export function reqString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${key} is required`)
  return value
}

export function optString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  if (value == null) return undefined
  if (typeof value !== 'string') throw new Error(`${key} must be a string`)
  return value
}

export function reqNumber(args: Record<string, unknown>, key: string): number {
  const value = args[key]
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) throw new Error(`${key} must be a finite number`)
  return n
}
