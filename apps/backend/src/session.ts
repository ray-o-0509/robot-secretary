import * as crypto from 'node:crypto'
import { getEnv } from './env'
import { timingSafeEqualString } from './crypto'

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30

type SessionPayload = {
  sub: string
  exp: number
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function sign(data: string): string {
  return crypto
    .createHmac('sha256', getEnv().sessionSecret)
    .update(data)
    .digest('base64url')
}

export function createSessionToken(userId: string): string {
  const payload: SessionPayload = {
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  }
  const encoded = base64url(JSON.stringify(payload))
  return `${encoded}.${sign(encoded)}`
}

export function verifySessionToken(token: string): SessionPayload {
  const [encoded, signature] = token.split('.')
  if (!encoded || !signature) throw new Error('Invalid session token')
  if (!timingSafeEqualString(signature, sign(encoded))) throw new Error('Invalid session signature')
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload
  if (!payload.sub || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('Session expired')
  }
  return payload
}

export function readBearerToken(header: string | null): string | null {
  if (!header?.startsWith('Bearer ')) return null
  return header.slice('Bearer '.length).trim() || null
}
