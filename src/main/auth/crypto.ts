import * as crypto from 'crypto'
import keytar from 'keytar'

const KEYCHAIN_SERVICE = 'robot-secretary'
const KEYCHAIN_MASTER_KEY = 'master-key'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

async function getMasterSecret(): Promise<Buffer> {
  let secret = await keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_MASTER_KEY)
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex')
    await keytar.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_MASTER_KEY, secret)
  }
  return Buffer.from(secret, 'hex')
}

export async function getDerivedKey(userId: string): Promise<Buffer> {
  const master = await getMasterSecret()
  return crypto.createHash('sha256').update(Buffer.concat([master, Buffer.from(':' + userId)])).digest()
}

export function encrypt(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

export function decrypt(b64ciphertext: string, key: Buffer): string {
  const buf = Buffer.from(b64ciphertext, 'base64')
  const iv = buf.subarray(0, IV_LENGTH)
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8')
}
