# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start electron-vite dev (main, preload, renderer with HMR; Renderer URL is injected as `ELECTRON_RENDERER_URL`)
- `npm run build` — `electron-vite build` then `electron-builder` (produces a macOS DMG; see `package.json` `build` block)
- `npm run preview` — preview the production build without packaging

There is no test runner, linter, or formatter configured. Don't fabricate one; ask before adding tooling.

## Architecture

This is an **Electron + React + Three.js** desktop app: a transparent, always-on-top, click-through window containing a floating 3D robot that runs as a Gemini Live voice assistant with function-calling into Gmail / Google Calendar / TickTick.

### Three processes (electron-vite layout)

- `src/main/index.ts` — main process. Owns the BrowserWindow, the global PTT hotkey, the wandering animation, the right-click context menu, and the IPC tool dispatcher.
- `src/preload/index.ts` — exposes a small `window.electronAPI` surface to the renderer via `contextBridge`. All renderer→main communication goes through it.
- `src/renderer/` — React app. `App.tsx` owns top-level state; `RobotScene.tsx` is the r3f canvas; `useGeminiLive.ts` is the voice loop.

Build outputs land in `out/{main,preload,renderer}/` and are referenced by `package.json` `main` (`out/main/index.js`).

### Voice loop (`src/renderer/hooks/useGeminiLive.ts`)

This is the central piece. On startup the renderer:
1. Opens a Gemini Live session (`gemini-2.0-flash-live-001`, audio modality, voice `Kore`) with a Japanese system prompt and a static `secretaryTools` function-declaration list.
2. Opens the mic at 16 kHz via `getUserMedia` and pipes PCM into `sendRealtimeInput` — but **only when `isPTTActiveRef.current` is true**. The mic stream is always live; PTT just gates upload.
3. PTT is driven by main-process events `ptt-start` / `ptt-stop`. On release, the renderer sends a small silence buffer so Gemini's VAD detects end-of-utterance.
4. Incoming `serverContent.modelTurn.parts[].inlineData` is base64 PCM at 24 kHz, scheduled sequentially on `playbackCtxRef` using `nextPlayTimeRef` so chunks don't overlap.
5. `toolCall.functionCalls` are forwarded to the main process via `electronAPI.callTool(name, args)` and the result is sent back with `sendToolResponse`. Tool names must match between `secretaryTools` (renderer) and the `switch` in `ipcMain.handle('call-tool', ...)` (main) — these two lists are the source of truth and are kept in sync manually.
6. Robot state (`idle | listening | speaking | thinking`) is mirrored to the main process via `sendRobotState` so wandering pauses during conversation.

### Global hotkey & permissions (macOS-specific)

PTT uses `uiohook-napi` to capture the left Option key globally. This requires macOS **Accessibility** permission; `setupPTT()` calls `systemPreferences.isTrustedAccessibilityClient(true)` to prompt, and the app continues without PTT if denied. Mic access is requested via `askForMediaAccess('microphone')`. If you change PTT behavior, remember the keycode is `UiohookKey.Alt` (left Option only — right Option `3640` is intentionally excluded).

### Window behavior

The window is `transparent: true, frame: false, alwaysOnTop: true, hasShadow: false`, and uses `setIgnoreMouseEvents(true, { forward: true })` so clicks pass through except for right-click (custom context menu in `setupContextMenu`). The wandering interval lerps `currentX/Y` toward random targets at 50ms ticks; pausing/resuming wandering toggles `isWandering`.

### Tool modules (`src/main/tools/*.ts`)

Each tool reads its credentials from `process.env` at call time and constructs its client lazily. Important quirks:

- **Gmail and Calendar reuse the user's `gmail-triage` Codex skill tokens** at `~/.config/gmail-triage/tokens/<email>.json` via `src/main/tools/googleAuth.ts`. Each token JSON has embedded `client_id` / `client_secret` / `scopes` (gmail.readonly + gmail.send + calendar). `gmail.ts` and `calendar.ts` both call `listAccounts()` and fan out to every token by default; pass an explicit `account` (Gmail) or use `GMAIL_ACCOUNT` env (single-account fallback in `getGoogleAuth`) to scope down. Calendar de-duplicates events by id across accounts. Run `node scripts/auth-google.mjs <email>` to (re)authorize when the refresh token expires or when adding new scopes.
- **TickTick** reads its access token from `TICKTICK_ACCESS_TOKEN` in `.env.local` (via `src/main/tools/tickTickAuth.ts`). Token is shared with the user's `daily-dashboard` Vercel project; if it expires, pull from there with `vercel env pull` against `daily-viewer`.
- **Dashboard** (`dashboard.ts`) reads daily summary entries from the user's `daily-dashboard` Turso (libSQL) DB via `@libsql/client`. Requires `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` in `.env.local` (copy from `daily-dashboard/.env.local`). Read-only; the `entries` rows are written by `daily-dashboard`'s skill scripts. `getDashboardEntry(skill, id?)` resolves `id` to the latest row when omitted; supported skills are `ai-news` / `best-tools` / `movies` / `spending`.

### Configuration: split between two stores

Two separate configuration mechanisms exist and they are not unified:

- **`.env` / `.env.local`** — loaded by the main process at startup (`dotenv.config` against `__dirname/../.env*`). Tool modules in `src/main/tools/*` read from `process.env`. This is where API-key style credentials (Gemini / Anthropic / Turso / TickTick) live; Google instead reads from external token files (see Tool modules above).
- **`localStorage`** in the renderer — written by `SettingsPanel.tsx`. **Only `GEMINI_API_KEY` is actually consumed** (by `useGeminiLive`, which falls back to `import.meta.env.VITE_GEMINI_API_KEY`). Main-process tools only see `process.env`. Treat this as a known gap when touching settings: if you wire a key through the UI, you must also propagate it to the main process (e.g. via IPC) or the tool calls will keep using `.env`.

### TypeScript configs

`tsconfig.json` is a project-references root pointing to `tsconfig.node.json` (main + preload + vite config) and `tsconfig.web.json` (renderer).

### 3D robot asset

`RobotScene.tsx` loads `/assets/robot.glb` via `useGLTF`. The actual file lives at `src/renderer/public/assets/robot.glb` and is served by Vite's public-dir convention. `hasGLB` is hard-coded `true`; the `PlaceholderRobot` is the Suspense fallback. All embedded animations are auto-played in a loop, and emissive materials get `emissiveIntensity = 6` + `toneMapped = false` so bloom reads them as HDR.

## Notes on user-facing strings

UI labels, the Gemini system prompt, and console warnings are all in Japanese. Keep new user-facing strings consistent with that unless explicitly asked otherwise.

## 1Password Environments (.env)

Personal repositories keep their environment variables in 1Password Environments. The `.env` file in the repository is a FIFO mounted by 1Password, not a regular file. It cannot be read while 1Password is locked.

| Repository | File | Environment |
|---|---|---|
| tixmo | `.env.local` | `tixmo-local` |
| tixmo | `.env.prod` | `tixmo-prod` |
| studydesk | `.env.local` | `studydesk` |
| agent-desk | `.env.local` | `agent-desk` |
| notes | `.env.local` | `notes` |
| robot-secretary | `.env.local` | `robot-secretary` |
| part-ii-graph-memory | `.env` | `part-ii-graph-memory` |

de-app and gen-pptx are excluded: their env files stay regular files.

Use the `1password` MCP server for env work:

- Call `authenticate` first; it returns the account ID. Then `list_environments`, and `list_variables` to see which variable names exist. It never returns values.
- Do not `cat` an env file to check a variable: use `list_variables`.
- Do not replace a mounted file with a regular `.env`. Do not edit it directly: edits do not reach 1Password.
- New variable: `append_variables`, with `concealed: true` for secrets. Never put a secret value in chat or a tool argument of the conversation: ask the user to add it in 1Password (Developer > Environments), or load it from a local file with a script that does not print it.
- Changing or deleting a variable has no MCP tool: the user does it in 1Password.
- New project: `create_environment`, then `create_local_env_file` with the absolute path of the env file.
