import { NextRequest, NextResponse } from 'next/server'
import { findUserById, updateUserLastSeen } from '../../../src/registry'
import { readBearerToken, verifySessionToken } from '../../../src/session'
import { jsonError, publicUser } from '../../../src/responses'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const token = readBearerToken(req.headers.get('authorization'))
    if (!token) return jsonError('Bearer token is required', 401)
    const payload = verifySessionToken(token)
    const user = await findUserById(payload.sub)
    if (!user) return jsonError('User not found', 404)
    await updateUserLastSeen(user.id)
    return NextResponse.json({ user: publicUser(user) })
  } catch (err) {
    return jsonError((err as Error).message, 401)
  }
}
