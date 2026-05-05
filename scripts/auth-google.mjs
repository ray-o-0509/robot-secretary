#!/usr/bin/env node

console.error([
  'scripts/auth-google.mjs is deprecated.',
  'Google tokens are now stored encrypted in Turso DB.',
  'Use Settings > Google from the app to add or refresh Google accounts.',
].join('\n'))
process.exit(1)
