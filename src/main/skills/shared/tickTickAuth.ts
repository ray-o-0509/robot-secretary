export function getTickTickToken(): string {
  const token = process.env.TICKTICK_ACCESS_TOKEN
  if (!token) {
    throw new Error('TICKTICK_ACCESS_TOKEN is not set in .env.local')
  }
  return token
}
