import { getEnv } from './env'

export type GoogleProfile = {
  sub: string
  email: string
  name: string | null
  picture: string | null
}

type GoogleTokenInfo = {
  aud?: string
  iss?: string
  exp?: string
  sub?: string
  email?: string
  email_verified?: string | boolean
  name?: string
  picture?: string
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  const { googleOAuthClientId } = getEnv()
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`)
  if (!res.ok) throw new Error(`Google token verification failed: ${res.status}`)
  const info = await res.json() as GoogleTokenInfo
  const issuerOk = info.iss === 'https://accounts.google.com' || info.iss === 'accounts.google.com'
  const exp = Number(info.exp ?? 0)
  const emailVerified = info.email_verified === true || info.email_verified === 'true'
  if (!issuerOk) throw new Error('Google token issuer is invalid')
  if (info.aud !== googleOAuthClientId) throw new Error('Google token audience is invalid')
  if (!exp || exp * 1000 <= Date.now()) throw new Error('Google token has expired')
  if (!info.sub || !info.email || !emailVerified) throw new Error('Google token profile is incomplete')
  return {
    sub: info.sub,
    email: info.email,
    name: info.name ?? null,
    picture: info.picture ?? null,
  }
}
