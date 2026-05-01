export function getTickTickToken(): string {
  const token = process.env.TICKTICK_ACCESS_TOKEN
  if (!token) {
    throw new Error('TICKTICK_ACCESS_TOKEN が .env.local に設定されてねえ')
  }
  return token
}
