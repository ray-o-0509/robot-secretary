const REQUIRED_ENV = [
  'ROBOT_SECRETARY_DB_URL',
  'TURSO_PLATFORM_API_TOKEN',
  'ROBOT_SECRETARY_REGISTRY_SECRET',
  'BACKEND_SESSION_SECRET',
  'GOOGLE_OAUTH_CLIENT_ID',
] as const

type RequiredEnvName = (typeof REQUIRED_ENV)[number]

function readRequiredEnv(name: RequiredEnvName): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

export function getEnv() {
  return {
    bootstrapDbUrl: readRequiredEnv('ROBOT_SECRETARY_DB_URL'),
    bootstrapDbToken: process.env.ROBOT_SECRETARY_DB_TOKEN,
    tursoOrg: process.env.TURSO_ORG ?? 'ray-o-0509',
    tursoPlatformToken: readRequiredEnv('TURSO_PLATFORM_API_TOKEN'),
    registrySecret: readRequiredEnv('ROBOT_SECRETARY_REGISTRY_SECRET'),
    sessionSecret: readRequiredEnv('BACKEND_SESSION_SECRET'),
    googleOAuthClientId: readRequiredEnv('GOOGLE_OAUTH_CLIENT_ID'),
  }
}
