# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start electron-vite dev (main, preload, renderer with HMR; Renderer URL is injected as `ELECTRON_RENDERER_URL`)
- `npm run build` — `electron-vite build` then `electron-builder` (produces a macOS DMG)
- `npm run build:app` — **日常使い用**。ビルド → `dist/mac-arm64/Robot Secretary.app` を `/Applications/` に上書きコピーする。署名済み（要: `Apple Development` 証明書）。コード変更後はこれを実行して `/Applications/Robot Secretary.app` を起動すること。
- `npm run preview` — preview the production build without packaging

There is no test runner, linter, or formatter configured. Don't fabricate one; ask before adding tooling.

## Build & Deploy workflow

コードを変更したら：

```bash
npm run build:app          # ビルド + /Applications に自動インストール
pkill -x "Robot Secretary" # 旧プロセスを終了（起動中の場合）
open "/Applications/Robot Secretary.app"
```

`build:app` は内部で `electron-builder --config.mac.target=dir` を使い DMG を作らないので高速。

### ⚠️ /Applications へのコピーが反映されない場合

`cp -r` は **コピー先が既に存在すると中に入れてしまう**（`cp -r dist/.../Robot\ Secretary.app /Applications/` → `/Applications/Robot Secretary.app/Robot Secretary.app` になる）。`build:app` スクリプトの `cp -r` が失敗なく終わっても古いrendererが残ることがある。

インストール後は必ずrendererのハッシュで確認：

```bash
node -e "
const asar = require('@electron/asar');
const files = asar.listPackage('/Applications/Robot Secretary.app/Contents/Resources/app.asar');
files.filter(f => f.includes('renderer') && f.includes('index')).forEach(f => console.log(f));
"
```

古いハッシュが出たら手動で上書き：

```bash
rm -rf "/Applications/Robot Secretary.app"
cp -r "$(pwd)/dist/mac-arm64/Robot Secretary.app" "/Applications/Robot Secretary.app"
```

## macOS permissions (重要)

### Bundle ID と署名

- **appId**: `package.json` の `build.mac.appId` で設定（例: `com.yourname.robot-secretary`）
- **署名 identity**: `security find-identity -v -p codesigning` で手元の証明書名を確認し `package.json` の `build.mac.identity` に指定する
- ad-hoc 署名アプリは macOS TCC が CDHash で識別するため、**ビルドのたびに CDHash が変わり TCC エントリが無効化される → アクセシビリティ権限がリセット**される。Apple Developer 証明書での署名を推奨。

### ⚠️ 起動するたびにアクセシビリティ権限がリセットされる問題

**根本原因**：Claude Code（非インタラクティブな Bash）から `build:app` を実行すると、electron-builder が Keychain にアクセスできず署名が失敗してアドホック署名（`Signature=adhoc`）になる。アドホック署名アプリは macOS TCC が CDHash で識別するため、**ビルドのたびに CDHash が変わり TCC エントリが無効化される → アクセシビリティ権限がリセット**される。

確認コマンド（`adhoc` と出たら署名失敗）：
```bash
codesign -d --verbose=2 "/Applications/Robot Secretary.app" 2>&1 | grep "Signature="
```

**対処法**：`build:app` はユーザー自身がインタラクティブなターミナルから実行すること。Claude Code に実行させると署名が壊れる。Claude Code にビルドさせた後は、ユーザーが自分のターミナルで以下を実行して再ビルド・インストールする：

```bash
cd <path-to-project>
npm run build:app
```

再ビルド後にアクセシビリティを一度付与すれば、次回以降は（再ビルドしない限り）持続する。

### prod環境の .env 配置

prod ビルドはプロジェクトルートの `.env.local` を読まない。`~/Library/Application Support/robot-secretary/` に配置する：

```bash
cp .env.local ~/Library/Application\ Support/robot-secretary/.env.local
```

`.env.local` を更新したら毎回このコピーが必要。

### 権限リセット（bundle ID 変更後など）

```bash
tccutil reset Microphone <your-app-id>
tccutil reset Accessibility <your-app-id>
tccutil reset ScreenCapture <your-app-id>
```

### セットアップ画面

起動時に必須権限（マイク + Gemini API Key）をチェックする。問題があれば自動的にセットアップウィンドウ（`#setup` ルート）を表示し、問題なければ直接ロボットを起動する。セットアップ画面の実装は `src/renderer/setup/SetupApp.tsx`、IPC ハンドラは `src/main/index.ts` の `registerSetupIpc()`。

### Renderer の getUserMedia 権限

`session.defaultSession.setPermissionRequestHandler` で `media` を明示的に許可している（`src/main/index.ts` の `app.whenReady`）。これがないと renderer の `getUserMedia` が常に拒否される。

### `DefaultTransporter is not a constructor` エラー

`googleapis-common` が `google-auth-library` の `DefaultTransporter` を使うが、pnpm パッチは top-level `node_modules/google-auth-library/` にのみ適用される。electron-builder は pnpm virtual store (`node_modules/.pnpm/google-auth-library@10.6.2/`) から asar を作るため、**パッチなしの版が asar に入る**。

`build:app` の冒頭に `patch:pnpm` スクリプトを実行してvirtual storeのファイルを上書きする：

```bash
npm run patch:pnpm  # node_modules/.pnpm/.../ に patched index.js をコピー
```

確認コマンド：
```bash
node -e "const asar = require('@electron/asar'); const c = asar.extractFile('dist/mac-arm64/Robot Secretary.app/Contents/Resources/app.asar', 'node_modules/google-auth-library/build/src/index.js').toString(); console.log('patched:', c.includes('DefaultTransporter'), 'size:', c.length)"
```

`pnpm install` を実行すると virtual store が上書きされてパッチが消えるので、再度 `npm run build:app` でリビルドすること。

### マイクがシステム設定に表示されない問題

Hardened Runtime（署名済みアプリ）では `NSMicrophoneUsageDescription` が Info.plist にあっても、**`com.apple.security.device.audio-input` エンタイトルメントがないとmacOSのマイクリストに載らない**。ダイアログも出ない。

`build/entitlements.mac.plist` に以下が必要：
```xml
<key>com.apple.security.device.audio-input</key>
<true/>
<key>com.apple.security.device.microphone</key>
<true/>
```

`package.json` の `build.mac` に以下が必要：
```json
"hardenedRuntime": true,
"entitlements": "build/entitlements.mac.plist",
"entitlementsInherit": "build/entitlements.mac.plist"
```

確認コマンド：
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
1. Opens a Gemini Live session (model from `MODELS.geminiLive` in `src/config/models.ts`, currently `gemini-3.1-flash-live-preview`; audio modality, voice `Kore`) with a Japanese system prompt and a static `secretaryTools` function-declaration list.
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

- **Gmail and Calendar** use Google OAuth2 tokens via `src/main/tools/googleAuth.ts`. トークンは **`~/.config/robot-secretary/google-tokens/<email>.json`** に置く（プロジェクト専用ディレクトリ）。このディレクトリがなければ旧 `~/.config/gmail-triage/tokens/` にフォールバックする。各トークン JSON には `client_id` / `client_secret` / `refresh_token` / `scopes` (gmail.readonly + gmail.send + calendar) が含まれる。`gmail.ts` と `calendar.ts` は `listAccounts()` で全トークンを自動検出しファンアウト。`GMAIL_ACCOUNT` env で絞り込み可能。refresh token は有効期限なし（手動失効しない限り）のでコピーするだけで再認証不要。トークンを再発行する場合は `node scripts/auth-google.mjs <email>` を実行し出力を `~/.config/robot-secretary/google-tokens/<email>.json` に保存する。
- **TickTick** reads its access token from `TICKTICK_ACCESS_TOKEN` in `.env.local` (via `src/main/tools/tickTickAuth.ts`). Obtain the token via TickTick's OAuth flow and place it in `.env.local`.
- **Dashboard** (`dashboard.ts`) reads daily summary entries from a Turso (libSQL) DB via `@libsql/client`. Requires `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` in `.env.local`. Read-only; the `entries` table is expected to have rows keyed by skill name. `getDashboardEntry(skill, id?)` resolves `id` to the latest row when omitted; supported skills are `ai-news` / `best-tools` / `movies` / `spending`.

### Configuration: split between two stores

Two separate configuration mechanisms exist and they are not unified:

- **`.env` / `.env.local`** — loaded by the main process at startup (`dotenv.config` against `__dirname/../.env*`). Tool modules in `src/main/tools/*` read from `process.env`. This is where API-key style credentials (Gemini / Anthropic / Turso / TickTick) live; Google instead reads from external token files (see Tool modules above).
- **`localStorage`** in the renderer — written by `SettingsPanel.tsx`. **Only `GEMINI_API_KEY` is actually consumed** (by `useGeminiLive`, which falls back to `import.meta.env.VITE_GEMINI_API_KEY`). Main-process tools only see `process.env`. Treat this as a known gap when touching settings: if you wire a key through the UI, you must also propagate it to the main process (e.g. via IPC) or the tool calls will keep using `.env`.

### TypeScript configs

`tsconfig.json` is a project-references root pointing to `tsconfig.node.json` (main + preload + vite config) and `tsconfig.web.json` (renderer).

### 3D robot asset

`RobotScene.tsx` loads `/assets/robot.glb` via `useGLTF`. The actual file lives at `src/renderer/public/assets/robot.glb` and is served by Vite's public-dir convention. `hasGLB` is hard-coded `true`; the `PlaceholderRobot` is the Suspense fallback. All embedded animations are auto-played in a loop, and emissive materials get `emissiveIntensity = 6` + `toneMapped = false` so bloom reads them as HDR.

## Error handling rules

エラーハンドリングを書くときは必ず `console.error(...)` でログを残すこと。

**なぜ必要か：** mainプロセスでは `console.error` が `writeDebugLog('error', ...)` に接続されており、`~/Library/Application Support/robot-secretary/debug.log` に自動追記される。`console.error` を呼ばないとデバッグログに何も残らず、本番環境でのトラブルシューティングが不可能になる。

### ルール

1. **catch ブロックは必ず `console.error` を呼ぶ** — エラーを握りつぶさない

   ```ts
   // Bad
   try { ... } catch { /* 無視 */ }

   // Good
   try { ... } catch (e) { console.error('[モジュール名] 何が失敗したか:', e) }
   ```

2. **ログの prefix に `[モジュール名]` を入れる** — `debug.log` で grep しやすくするため

   ```ts
   console.error('[nordvpn] connect failed:', e)
   console.error('[gmail] fetchInbox error:', e)
   ```

3. **エラーオブジェクトをそのまま渡す** — `e.message` だけでなく `e` ごと渡してスタックトレースを残す

   ```ts
   // Bad
   console.error('[skill] failed:', (e as Error).message)

   // Good
   console.error('[skill] failed:', e)
   ```

4. **rendererのエラーはIPCで伝播するか `console.error` を使う** — rendererの `console.error` はmainプロセスの `webContents.on('console-message')` 経由で `[renderer:error]` としてdebug.logに書き込まれる（`src/main/index.ts` の `page.on('console')` ハンドラ参照）

### debug.log の確認方法

```bash
tail -f ~/Library/Application\ Support/robot-secretary/debug.log
```

## Notes on user-facing strings

UI labels, the Gemini system prompt, and console warnings are all in Japanese. Keep new user-facing strings consistent with that unless explicitly asked otherwise.
