import { createClient, type Client } from '@libsql/client'
import { getSecretSync } from '../secrets/index'

export type DashboardSkill = 'ai-news' | 'best-tools' | 'movies' | 'spending'

let cached: Client | null = null

export function getTursoClient(): Client {
  if (cached) return cached
  const url = getSecretSync('TURSO_DATABASE_URL')
  const authToken = getSecretSync('TURSO_AUTH_TOKEN')
  if (!url) throw new Error('TURSO_DATABASE_URL is not set. Configure it in Settings → Skills.')
  cached = createClient({ url, authToken })
  return cached
}

export type EntryResult =
  | { skill: DashboardSkill; id: string; subtitle: string; data: unknown }
  | { error: string }

export async function getDashboardEntry(
  skill: DashboardSkill,
  id?: string,
): Promise<EntryResult> {
  const client = getTursoClient()

  let resolvedId = id
  if (!resolvedId || resolvedId === 'latest') {
    const latest = await client.execute({
      sql: 'SELECT id FROM entries WHERE skill = ? ORDER BY id DESC LIMIT 1',
      args: [skill],
    })
    if (latest.rows.length === 0) return { error: `no entries for skill=${skill}` }
    resolvedId = String(latest.rows[0].id)
  }

  const row = await client.execute({
    sql: 'SELECT subtitle, data FROM entries WHERE skill = ? AND id = ? LIMIT 1',
    args: [skill, resolvedId],
  })
  if (row.rows.length === 0) return { error: `no entry for skill=${skill} id=${resolvedId}` }

  const raw = row.rows[0]
  const subtitle = (raw.subtitle as string | null) ?? ''
  const dataText = raw.data as string
  let data: unknown
  try {
    data = JSON.parse(dataText)
  } catch {
    data = dataText
  }
  return { skill, id: resolvedId, subtitle, data }
}
