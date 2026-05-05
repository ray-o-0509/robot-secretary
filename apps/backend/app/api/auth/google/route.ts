import * as crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { verifyGoogleIdToken } from '../../../../src/google'
import { createUserRecord, findUserByGoogleId, updateUserProfile } from '../../../../src/registry'
import { applyUserDbSchema, issueUserDbToken, provisionUserDb } from '../../../../src/turso'
import { createSessionToken } from '../../../../src/session'
import { jsonError, publicUser } from '../../../../src/responses'

export const runtime = 'nodejs'

type AuthBody = {
  idToken?: string
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as AuthBody
    if (!body.idToken) return jsonError('idToken is required')

    const profile = await verifyGoogleIdToken(body.idToken)
    const existing = await findUserByGoogleId(profile.sub)
    if (existing) {
      await updateUserProfile(existing.id, {
        email: profile.email,
        displayName: profile.name,
        avatarUrl: profile.picture,
      })
      const updated = { ...existing, email: profile.email, displayName: profile.name, avatarUrl: profile.picture }
      const dbToken = await issueUserDbToken(updated.dbName)
      return NextResponse.json({ sessionToken: createSessionToken(updated.id), user: publicUser(updated, dbToken) })
    }

    const id = crypto.randomUUID()
    const db = await provisionUserDb(id)
    await applyUserDbSchema(db.dbUrl, db.dbToken)
    const user = {
      id,
      googleId: profile.sub,
      email: profile.email,
      displayName: profile.name,
      avatarUrl: profile.picture,
      ...db,
    }
    await createUserRecord(user)
    const dbToken = await issueUserDbToken(user.dbName)
    return NextResponse.json({ sessionToken: createSessionToken(user.id), user: publicUser(user, dbToken) }, { status: 201 })
  } catch (err) {
    console.error('[auth/google]', err)
    return jsonError((err as Error).message, 500)
  }
}
