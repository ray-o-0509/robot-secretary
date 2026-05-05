import * as crypto from 'node:crypto'

function keyFromSecret(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest()
}

export function encryptSecret(plaintext: string, secret: string): string {
  const iv = crypto.randomBytes(12)
  const key = keyFromSecret(secret)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

export function decryptSecret(ciphertext: string, secret: string): string {
  const buf = Buffer.from(ciphertext, 'base64')
  const iv = buf.subarray(0, 12)
  const authTag = buf.subarray(12, 28)
  const encrypted = buf.subarray(28)
  const key = keyFromSecret(secret)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8')
}

export function timingSafeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb)
}
