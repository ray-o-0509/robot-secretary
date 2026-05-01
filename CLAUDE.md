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

各スキルは `src/main/skills/<name>/index.ts` に独立。共通コードは `src/main/skills/shared/` に集約。`dispatcher.ts` がスキル一覧を束ねて Claude に渡す。

Each skill reads its credentials from `process.env` at call time and constructs its client lazily. Important quirks:

- **Gmail and Calendar** use Google OAuth2 tokens via `src/main/skills/shared/googleAuth.ts`. トークンは **`~/.config/robot-secretary/google-tokens/<email>.json`** に置く（プロジェクト専用ディレクトリ）。このディレクトリがなければ旧 `~/.config/gmail-triage/tokens/` にフォールバックする。各トークン JSON には `client_id` / `client_secret` / `refresh_token` / `scopes` (gmail.readonly + gmail.send + calendar) が含まれる。`gmail/index.ts` と `calendar/index.ts` は `listAccounts()` で全トークンを自動検出しファンアウト。`GMAIL_ACCOUNT` env で絞り込み可能。refresh token は有効期限なし（手動失効しない限り）のでコピーするだけで再認証不要。トークンを再発行する場合は `node scripts/auth-google.mjs <email>` を実行し出力を `~/.config/robot-secretary/google-tokens/<email>.json` に保存する。
- **TickTick** reads its access token from `TICKTICK_ACCESS_TOKEN` in `.env.local` (via `src/main/skills/shared/tickTickAuth.ts`). Obtain the token via TickTick's OAuth flow and place it in `.env.local`.
- **Dashboard / ai-news / movies / best-tools** は private サブモジュール（`src/private`）に切り出されている。Requires `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` in `.env.local`. private サブモジュールがない環境でも `dispatcher.ts` が動的ロードを試みて失敗しても無視するので、ビルド・起動は正常に動く。

### Configuration: split between two stores

Two separate configuration mechanisms exist and they are not unified:

- **`.env` / `.env.local`** — loaded by the main process at startup (`dotenv.config` against `__dirname/../.env*`). Skill modules in `src/main/skills/*` read from `process.env`. This is where API-key style credentials (Gemini / Anthropic / Turso / TickTick) live; Google instead reads from external token files (see Skill modules above).
- **`localStorage`** in the renderer — written by `SettingsApp.tsx`. **Only `GEMINI_API_KEY` is actually consumed** (by `useGeminiLive`, which falls back to `import.meta.env.VITE_GEMINI_API_KEY`). Treat this as a known gap when touching settings: if you wire a key through the UI, you must also propagate it to the main process (e.g. via IPC) or the skill calls will keep using `.env`.

### TypeScript configs

`tsconfig.json` is a project-references root pointing to `tsconfig.node.json` (main + preload + vite config) and `tsconfig.web.json` (renderer). `tsconfig.electron.json` exists but references a nonexistent `electron/` directory and is **not** part of the active build — ignore it unless you're cleaning up.

### 3D robot asset

`RobotScene.tsx` loads `/assets/robot.glb` via `useGLTF`. The actual file lives at `src/renderer/public/assets/robot.glb` and is served by Vite's public-dir convention. `hasGLB` is hard-coded `true`; the `PlaceholderRobot` is the Suspense fallback. All embedded animations are auto-played in a loop, and emissive materials get `emissiveIntensity = 6` + `toneMapped = false` so bloom reads them as HDR.

### Prompts

システムプロンプトはすべて `.md` ファイルで管理し、Vite の `?raw` インポートでビルド時にインライン化される。TSを触らずMDを編集するだけでプロンプト変更が完結する。

| ファイル | 用途 |
|---|---|
| `src/main/agent/prompt.md` | Claude エージェントのシステムプロンプト |
| `src/renderer/hooks/prompts/core.md` | Gemini Live の共通コアプロンプト |
| `src/renderer/hooks/prompts/persona/{en,ja,zh,ko}.md` | 言語別ペルソナ定義 |
| `src/renderer/display/prompt.md` | ディスプレイパネルへの表示指示 |
| `src/renderer/skills/*/prompt.md` | 各スキルの補足プロンプト |

`buildPrompt(languageCode)` が persona + core + 全スキルの prompt.md を結合して Gemini Live に渡す（`src/renderer/hooks/prompts/index.ts`）。

### スキルの追加方法

1. **main**: `src/main/skills/<name>/index.ts` に関数実装 → `dispatcher.ts` の `publicToolSchemas` にスキーマを追加し `executeTool` の switch に case を追加
2. **renderer**: `src/renderer/skills/<name>/View.tsx` に UI を実装 → `App.tsx` の panel ルーティングに追加
3. **prompt**: `src/renderer/skills/<name>/prompt.md` を作成 → `src/renderer/hooks/prompts/index.ts` の SKILLS 配列に追加
4. **Gemini tool list**: `useGeminiLive.ts` の `secretaryTools` 配列にも同じツール定義を追加（main と renderer の両方に宣言が必要）

## Notes on user-facing strings

設定画面・セットアップ画面の UI ラベルは i18n（react-i18next）で管理している。翻訳リソースは `src/renderer/locales/{en,ja,zh}.json`。新しい UI 文字列を追加するときはこれらのファイルに追記すること。

Gemini のシステムプロンプトと Claude エージェントのプロンプトは日本語で書かれている。コンソールの警告も日本語で統一。
