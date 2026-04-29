export function asRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object') throw new Error('引数はオブジェクトである必要があります')
  return input as Record<string, unknown>
}

export function reqString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${key} は必須の文字列です`)
  return value
}

export function optString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  if (value == null) return undefined
  if (typeof value !== 'string') throw new Error(`${key} は文字列である必要があります`)
  return value
}
