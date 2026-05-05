import { createClient } from '@libsql/client'
import * as fs from 'node:fs'
import * as path from 'node:path'

const TURSO_API_BASE = 'https://api.turso.tech/v1'

function org(): string {
  return process.env.TURSO_ORG ?? 'ray-o-0509'
}

function platformToken(): string {
  const t = process.env.TURSO_PLATFORM_API_TOKEN
  if (!t) throw new Error('TURSO_PLATFORM_API_TOKEN is not set')
  return t
}

async function apiGet(path: string): Promise<unknown> {
  const res = await fetch(`${TURSO_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${platformToken()}` },
  })
  if (!res.ok) throw new Error(`Turso API GET ${path} failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function apiPost(path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${TURSO_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${platformToken()}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`Turso API POST ${path} failed: ${res.status} ${await res.text()}`)
  return res.json()
}

export async function provisionUserDb(userId: string): Promise<{ dbName: string; dbUrl: string; dbToken: string }> {
  const dbName = `rs-${userId.slice(0, 8)}`

  // Create database
  const created = await apiPost(`/organizations/${org()}/databases`, {
    name: dbName,
    group: 'default',
  }) as { database: { Hostname: string } }
  const dbUrl = `libsql://${created.database.Hostname}`

  // Create a full-access token for this DB
  const tokenResult = await apiPost(
    `/organizations/${org()}/databases/${dbName}/auth/tokens?expiration=never`,
  ) as { jwt: string }

  return { dbName, dbUrl, dbToken: tokenResult.jwt }
}

export async function applyUserDbSchema(dbUrl: string, dbToken: string): Promise<void> {
  const schemaPath = path.join(__dirname, '../../../scripts/schema-user.sql')
  const schema = fs.readFileSync(schemaPath, 'utf-8')
  const client = createClient({ url: dbUrl, authToken: dbToken })
  try {
    const statements = schema
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'))
    for (const stmt of statements) {
      await client.execute(stmt)
    }
  } finally {
    client.close()
  }
}

export async function getUserDbToken(dbName: string): Promise<string> {
  const result = await apiPost(
    `/organizations/${org()}/databases/${dbName}/auth/tokens?expiration=never`,
  ) as { jwt: string }
  return result.jwt
}

export async function listUserDbs(): Promise<string[]> {
  const result = await apiGet(`/organizations/${org()}/databases`) as { databases: { Name: string }[] }
  return result.databases
    .map((d) => d.Name)
    .filter((n) => n.startsWith('rs-'))
}
