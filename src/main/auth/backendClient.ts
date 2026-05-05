import { net } from 'electron'

const PROD_BACKEND_URL = 'https://backend-three-steel-43.vercel.app'

function getBackendUrl(): string {
  return process.env.ROBOT_SECRETARY_BACKEND_URL ?? PROD_BACKEND_URL
}

export type BackendUser = {
  id: string
  googleId: string
  email: string
  displayName: string | null
  avatarUrl: string | null
  dbName: string
  dbUrl: string
  dbToken: string
}

type LoginResponse = {
  sessionToken: string
  user: BackendUser
}

async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${getBackendUrl()}${path}`
  // Use net.fetch in Electron main process (bypasses CORS, uses Chromium network stack)
  return net.fetch(url, init as Parameters<typeof net.fetch>[1])
}

export async function loginWithBackend(idToken: string): Promise<LoginResponse> {
  const res = await backendFetch('/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Backend login failed: ${res.status} ${err}`)
  }
  return res.json() as Promise<LoginResponse>
}

export async function getMe(sessionToken: string): Promise<BackendUser> {
  const res = await backendFetch('/api/me', {
    headers: { Authorization: `Bearer ${sessionToken}` },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Backend /me failed: ${res.status} ${err}`)
  }
  const body = await res.json() as { user: BackendUser }
  return body.user
}
