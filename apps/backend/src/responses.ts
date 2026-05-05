import { NextResponse } from 'next/server'
import type { UserRecord } from './registry'

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export function publicUser(user: UserRecord, dbToken = user.dbToken) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    dbName: user.dbName,
    dbUrl: user.dbUrl,
    dbToken,
  }
}
