# Robot Secretary Backend

Next.js API backend for Vercel. This service owns Turso bootstrap credentials and Turso Platform provisioning so production Electron builds do not need platform-level tokens.

## Environment variables

Set these as Vercel server-side environment variables. Do not prefix them with `NEXT_PUBLIC_`.

- `ROBOT_SECRETARY_DB_URL` — bootstrap registry Turso DB URL
- `ROBOT_SECRETARY_DB_TOKEN` — optional bootstrap registry Turso auth token
- `TURSO_PLATFORM_API_TOKEN` — Turso Platform API token used to create per-user DBs
- `TURSO_ORG` — Turso organization slug; defaults to `ray-o-0509`
- `ROBOT_SECRETARY_REGISTRY_SECRET` — secret used to encrypt per-user DB tokens in `user_registry`
- `BACKEND_SESSION_SECRET` — secret used to sign backend session tokens
- `GOOGLE_OAUTH_CLIENT_ID` — Google OAuth client ID accepted by `/api/auth/google`

## API

- `GET /api/health`
- `POST /api/auth/google` with `{ "idToken": "..." }`
- `GET /api/me` with `Authorization: Bearer <sessionToken>`
