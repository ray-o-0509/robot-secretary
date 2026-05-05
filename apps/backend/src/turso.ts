import { createClient } from '@libsql/client'
import { getEnv } from './env'
import { splitSqlStatements, USER_DB_SCHEMA } from './userDbSchema'

const TURSO_API_BASE = 'https://api.turso.tech/v1'

async function apiPost(path: string, body?: unknown): Promise<unknown> {
  const { tursoPlatformToken } = getEnv()
  const res = await fetch(`${TURSO_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tursoPlatformToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`Turso API POST ${path} failed: ${res.status} ${await res.text()}`)
  return res.json()
}

export async function provisionUserDb(userId: string): Promise<{ dbName: string; dbUrl: string; dbToken: string }> {
  const { tursoOrg } = getEnv()
  const dbName = `rs-${userId.slice(0, 8)}`
  const created = await apiPost(`/organizations/${tursoOrg}/databases`, {
    name: dbName,
    group: 'default',
  }) as { database: { Hostname: string } }
  const dbUrl = `libsql://${created.database.Hostname}`
  const tokenResult = await apiPost(
    `/organizations/${tursoOrg}/databases/${dbName}/auth/tokens?expiration=never`,
  ) as { jwt: string }
  return { dbName, dbUrl, dbToken: tokenResult.jwt }
}

export async function applyUserDbSchema(dbUrl: string, dbToken: string): Promise<void> {
  const client = createClient({ url: dbUrl, authToken: dbToken })
  try {
    for (const statement of splitSqlStatements(USER_DB_SCHEMA)) {
      await client.execute(statement)
    }
  } finally {
    client.close()
  }
}
