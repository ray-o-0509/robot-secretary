# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Rules

- [Architecture & directory layout](.claude/rules/architecture.md)
- [Private / public boundary](.claude/rules/private-public-boundary.md)
- [Skill conventions](.claude/rules/skills.md)

## Commands

- `npm run dev` — start electron-vite dev (main, preload, renderer with HMR; Renderer URL is injected as `ELECTRON_RENDERER_URL`)
- `npm run build` — `electron-vite build` then `electron-builder` (produces a macOS DMG)
- `npm run build:app` — **daily use**. Builds the app and overwrites `dist/mac-arm64/Robot Secretary.app` into `/Applications/`. Requires an `Apple Development` certificate. Run this after code changes, then launch `/Applications/Robot Secretary.app`.
- `npm run preview` — preview the production build without packaging

There is no test runner, linter, or formatter configured. Don't fabricate one; ask before adding tooling.

## Build & Deploy workflow

After changing code:

```bash
npm run build:app          # build + auto-install to /Applications
pkill -x "Robot Secretary" # kill the old process if running
open "/Applications/Robot Secretary.app"
```

`build:app` uses `electron-builder --config.mac.target=dir` internally so it skips DMG creation and is fast.

### ⚠️ Stale renderer after install

`cp -r` nests the source inside the destination if the destination already exists (`cp -r dist/.../Robot Secretary.app /Applications/` → `/Applications/Robot Secretary.app/Robot Secretary.app`). The `build:app` script can silently leave the old renderer in place.

Verify the renderer hash after install:

```bash
node -e "
const asar = require('@electron/asar');
const files = asar.listPackage('/Applications/Robot Secretary.app/Contents/Resources/app.asar');
files.filter(f => f.includes('renderer') && f.includes('index')).forEach(f => console.log(f));
"
```

If the hash is stale, overwrite manually:

```bash
rm -rf "/Applications/Robot Secretary.app"
cp -r "$(pwd)/dist/mac-arm64/Robot Secretary.app" "/Applications/Robot Secretary.app"
```

## macOS permissions

### Bundle ID and signing

- **appId**: set in `package.json` at `build.mac.appId` (e.g. `com.yourname.robot-secretary`)
- **signing identity**: run `security find-identity -v -p codesigning` to find your cert name and set it in `package.json` at `build.mac.identity`
- Ad-hoc signed apps are identified by CDHash, which changes on every build, so macOS TCC invalidates the entry and **resets Accessibility permission** on each rebuild. Use an Apple Developer certificate to avoid this.

### ⚠️ Accessibility permission resets on every launch

**Root cause**: when `build:app` runs from Claude Code (non-interactive Bash), electron-builder cannot access the Keychain, signing fails, and the app gets an ad-hoc signature (`Signature=adhoc`). macOS TCC identifies ad-hoc apps by CDHash, so **every rebuild changes the CDHash and invalidates the TCC entry**.

Check the signature (if `adhoc` appears, signing failed):
```bash
codesign -d --verbose=2 "/Applications/Robot Secretary.app" 2>&1 | grep "Signature="
```

**Fix**: always run `build:app` from an interactive terminal yourself. After Claude Code modifies files, run the build from your own terminal:

```bash
cd <path-to-project>
npm run build:app
```

Once you grant Accessibility after a proper build, it persists until the next rebuild.

### .env placement for production builds

Production builds do not read `.env.local` from the project root. Place it in the app support directory:

```bash
cp .env.local ~/Library/Application\ Support/robot-secretary/.env.local
```

This copy is required every time `.env.local` is updated.

### Resetting permissions (e.g. after bundle ID change)

```bash
tccutil reset Microphone <your-app-id>
tccutil reset Accessibility <your-app-id>
tccutil reset ScreenCapture <your-app-id>
```

### Setup screen

On launch, the app checks for required permissions (microphone + Gemini API key). If anything is missing it automatically opens the setup window (`#setup` route); otherwise it starts the robot directly. The setup screen is implemented in `src/renderer/setup/SetupApp.tsx`; IPC handlers live in `registerSetupIpc()` in `src/main/index.ts`.

### Renderer getUserMedia permission

`session.defaultSession.setPermissionRequestHandler` explicitly allows `media` in `app.whenReady` (`src/main/index.ts`). Without this, `getUserMedia` in the renderer is always denied.

### `DefaultTransporter is not a constructor` error

`googleapis-common` uses `DefaultTransporter` from `google-auth-library`, but the pnpm patch only applies to the top-level `node_modules/google-auth-library/`. electron-builder builds the asar from the pnpm virtual store (`node_modules/.pnpm/google-auth-library@10.6.2/`), so **the unpatched version ends up in the asar**.

`build:app` runs the `patch:pnpm` script at the start to overwrite the virtual store file:

```bash
npm run patch:pnpm  # copies patched index.js into node_modules/.pnpm/.../
```

Verify:
```bash
node -e "const asar = require('@electron/asar'); const c = asar.extractFile('dist/mac-arm64/Robot Secretary.app/Contents/Resources/app.asar', 'node_modules/google-auth-library/build/src/index.js').toString(); console.log('patched:', c.includes('DefaultTransporter'), 'size:', c.length)"
```

Running `pnpm install` overwrites the virtual store and removes the patch — rebuild with `npm run build:app` afterwards.

### Microphone not appearing in System Settings

With Hardened Runtime, even if `NSMicrophoneUsageDescription` is in Info.plist, macOS will not list the app in the microphone settings and will show no dialog unless **`com.apple.security.device.audio-input`** is in the entitlements.

Required in `build/entitlements.mac.plist`:
```xml
<key>com.apple.security.device.audio-input</key>
<true/>
<key>com.apple.security.device.microphone</key>
<true/>
```

Required in `package.json` under `build.mac`:
```json
"hardenedRuntime": true,
"entitlements": "build/entitlements.mac.plist",
"entitlementsInherit": "build/entitlements.mac.plist"
```

Verify:
```bash
codesign -d --entitlements - "/Applications/Robot Secretary.app" 2>/dev/null | grep -E "audio-input|microphone"
```

## Architecture

This is an **Electron + React + Three.js** desktop app: a transparent, always-on-top, click-through window containing a floating 3D robot that runs as a Gemini Live voice assistant with function-calling into Gmail / Google Calendar / TickTick.

### Three processes (electron-vite layout)

- `src/main/index.ts` — main process. Owns the BrowserWindow, the global PTT hotkey, the wandering animation, the right-click context menu, and the IPC tool dispatcher.
- `src/preload/index.ts` — exposes a small `window.electronAPI` surface to the renderer via `contextBridge`. All renderer→main communication goes through it.
- `src/renderer/` — React app. `App.tsx` owns top-level state; `RobotScene.tsx` is the r3f canvas; `useGeminiLive.ts` is the voice loop.

Build outputs land in `out/{main,preload,renderer}/` and are referenced by `package.json` `main` (`out/main/index.js`).

### Voice loop (`src/renderer/hooks/useGeminiLive.ts`)

This is the central piece. On startup the renderer:
1. Opens a Gemini Live session (`gemini-2.0-flash-live-001`, audio modality, voice `Kore`) with a system prompt built by `buildPrompt(languageCode)` (see Prompts section) and a static `secretaryTools` function-declaration list.
2. Opens the mic at 16 kHz via `getUserMedia` and pipes PCM into `sendRealtimeInput` — but **only when `isPTTActiveRef.current` is true**. The mic stream is always live; PTT just gates upload.
3. PTT is driven by main-process events `ptt-start` / `ptt-stop`. On release, the renderer sends a small silence buffer so Gemini's VAD detects end-of-utterance.
4. Incoming `serverContent.modelTurn.parts[].inlineData` is base64 PCM at 24 kHz, scheduled sequentially on `playbackCtxRef` using `nextPlayTimeRef` so chunks don't overlap.
5. `toolCall.functionCalls` are forwarded to the main process via `electronAPI.callTool(name, args)` and the result is sent back with `sendToolResponse`. Tool names must match between `secretaryTools` (renderer) and `src/main/skills/dispatcher.ts` (main) — these two lists are the source of truth and are kept in sync manually.
6. Robot state (`idle | listening | speaking | thinking`) is mirrored to the main process via `sendRobotState` so wandering pauses during conversation.

### Global hotkey & permissions (macOS-specific)

PTT uses `uiohook-napi` to capture the left Option key globally. This requires macOS **Accessibility** permission; `setupPTT()` calls `systemPreferences.isTrustedAccessibilityClient(true)` to prompt, and the app continues without PTT if denied. Mic access is requested via `askForMediaAccess('microphone')`. If you change PTT behavior, remember the keycode is `UiohookKey.Alt` (left Option only — right Option `3640` is intentionally excluded).

### Window behavior

The window is `transparent: true, frame: false, alwaysOnTop: true, hasShadow: false`, and uses `setIgnoreMouseEvents(true, { forward: true })` so clicks pass through except for right-click (custom context menu in `setupContextMenu`). The wandering interval lerps `currentX/Y` toward random targets at 50ms ticks; pausing/resuming wandering toggles `isWandering`.

### Skill modules (`src/main/skills/`)

Each skill lives in `src/main/skills/<name>/index.ts` as a standalone module. Shared utilities (auth helpers, validation) are in `src/main/skills/shared/`. `dispatcher.ts` aggregates all skill schemas and routes tool calls to the correct implementation.

Each skill reads its credentials from `process.env` at call time and constructs its client lazily. Important quirks:

- **Gmail and Calendar** use Google OAuth2 tokens via `src/main/skills/shared/googleAuth.ts`. Tokens live at **`~/.config/robot-secretary/google-tokens/<email>.json`** (falls back to `~/.config/gmail-triage/tokens/` if not found). Each token JSON contains `client_id`, `client_secret`, `refresh_token`, and `scopes` (gmail.readonly + gmail.send + calendar). `gmail/index.ts` and `calendar/index.ts` use `listAccounts()` to auto-discover all tokens and fan out. Filter to one account with the `GMAIL_ACCOUNT` env var. Refresh tokens do not expire unless manually revoked — copy the file to reuse without re-auth. To issue a new token: run `node scripts/auth-google.mjs <email>` and save the output to `~/.config/robot-secretary/google-tokens/<email>.json`.
- **TickTick** reads its access token from `TICKTICK_ACCESS_TOKEN` in `.env.local` (via `src/main/skills/shared/tickTickAuth.ts`). Obtain the token via TickTick's OAuth flow and place it in `.env.local`.
- **Dashboard / ai-news / movies / best-tools** are in the private submodule (`src/private`). Requires `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` in `.env.local`. If the private submodule is absent, `dispatcher.ts` attempts a dynamic import, silently ignores the failure, and the app builds and runs normally with only the public skills.

### Configuration: split between two stores

Two separate configuration mechanisms exist and they are not unified:

- **`.env` / `.env.local`** — loaded by the main process at startup (`dotenv.config` against `__dirname/../.env*`). Skill modules in `src/main/skills/*` read from `process.env`. This is where API-key style credentials (Gemini / Anthropic / Turso / TickTick) live; Google instead reads from external token files (see Skill modules above).
- **`localStorage`** in the renderer — written by `SettingsApp.tsx`. **Only `GEMINI_API_KEY` is actually consumed** (by `useGeminiLive`, which falls back to `import.meta.env.VITE_GEMINI_API_KEY`). Treat this as a known gap when touching settings: if you wire a key through the UI, you must also propagate it to the main process (e.g. via IPC) or the skill calls will keep using `.env`.

### TypeScript configs

`tsconfig.json` is a project-references root pointing to `tsconfig.node.json` (main + preload + vite config) and `tsconfig.web.json` (renderer). `tsconfig.electron.json` exists but references a nonexistent `electron/` directory and is **not** part of the active build — ignore it unless you're cleaning up.

### 3D robot asset

`RobotScene.tsx` loads `/assets/robot.glb` via `useGLTF`. The actual file lives at `src/renderer/public/assets/robot.glb` and is served by Vite's public-dir convention. `hasGLB` is hard-coded `true`; the `PlaceholderRobot` is the Suspense fallback. All embedded animations are auto-played in a loop, and emissive materials get `emissiveIntensity = 6` + `toneMapped = false` so bloom reads them as HDR.

### Prompts

All system prompts are managed as `.md` files and inlined at build time via Vite's `?raw` import. Prompt changes require only editing the `.md` file — no TypeScript changes needed.

| File | Purpose |
|---|---|
| `src/main/agent/prompt.md` | Claude agent system prompt |
| `src/renderer/hooks/prompts/core.md` | Gemini Live shared core prompt |
| `src/renderer/hooks/prompts/persona/{en,ja,zh,ko}.md` | Per-language persona definitions |
| `src/renderer/display/prompt.md` | Display panel rendering instructions |
| `src/renderer/skills/*/prompt.md` | Per-skill supplementary prompts |

`buildPrompt(languageCode)` concatenates persona + core + all skill prompts and passes the result to Gemini Live (`src/renderer/hooks/prompts/index.ts`).

## Notes on user-facing strings

UI labels in the settings and setup screens are managed with i18n (react-i18next). Translation resources live in `src/renderer/locales/{en,ja,zh}.json`. Add new UI strings there.

The Gemini system prompt and Claude agent prompt are written in Japanese. Keep console warnings in Japanese for consistency.
