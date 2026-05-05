import { getSecretSync } from '../secrets/index'

export function getTickTickToken(): string {
  const token = getSecretSync('TICKTICK_ACCESS_TOKEN')
  if (!token) {
    throw new Error('TICKTICK_ACCESS_TOKEN is not set. Configure it in Settings → Skills.')
  }
  return token
}
