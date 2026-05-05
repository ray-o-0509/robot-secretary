import { createClient, type Client } from '@libsql/client'

let cached: Client | null = null

export function getSecretaryDb(): Client {
  if (cached) return cached
  const url = process.env.ROBOT_SECRETARY_DB_URL
  const authToken = process.env.ROBOT_SECRETARY_DB_TOKEN
  if (!url) throw new Error('ROBOT_SECRETARY_DB_URL is not set')
  cached = createClient({ url, authToken })
  return cached
}

export function resetSecretaryDb(): void {
  cached = null
}
