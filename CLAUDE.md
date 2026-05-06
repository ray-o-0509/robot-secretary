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

`.env.local` を更新したら毎回このコピーが必要（ただし Gemini/Anthropic/TickTick などのキーは Settings UI から DB 経由で保存するほうが推奨）。

### 権限リセット（bundle ID 変更後など）

```bash
tccutil reset Microphone <your-app-id>
tccutil reset Accessibility <your-app-id>
tccutil reset ScreenCapture <your-app-id>
```

### マイクがシステム設定に表示されない問題

Hardened Runtime（署名済みアプリ）では `NSMicrophoneUsageDescription` が Info.plist にあっても、**`com.apple.security.device.audio-input` エンタイトルメントがないとmacOSのマイクリストに載らない**。ダイアログも出ない。

`build/entitlements.mac.plist` に以下が必要：
```xml
<key>com.apple.security.device.audio-input</key>
<true/>
<key>com.apple.security.device.microphone</key>
<true/>
```

確認コマンド：
```bash
codesign -d --entitlements - "/Applications/Robot Secretary.app" 2>/dev/null | grep -E "audio-input|microphone"
```

## Architecture

This is an **Electron + React + Three.js** desktop app: a transparent, always-on-top, click-through window containing a floating 3D robot that runs as a Gemini Live voice assistant with function-calling into Gmail / Google Calendar / TickTick / Google Drive / Apple Music / NordVPN / shell, etc.

### Three processes (electron-vite layout)

- `src/main/index.ts` — main process。BrowserWindow 管理・グローバル PTT ホットキー・放浪アニメーション・右クリックメニュー・認証フロー。
- `src/preload/index.ts` — `contextBridge` で `window.electronAPI` を renderer に公開。すべての renderer→main 通信はここを経由する。
- `src/renderer/` — React app。`App.tsx` がトップレベル状態を保持。`RobotScene.tsx` が r3f canvas。`useGeminiLive.ts` が音声ループ。

Build 成果物は `out/{main,preload,renderer}/` に入り、`package.json` の `main` (`out/main/index.js`) で参照される。

### 起動シーケンス

1. `app.whenReady()` → Keychain からセッショントークンを取得
2. トークンがあれば Turso DB でユーザー解決 → `startAuthenticatedApp(user)` → DB マイグレーション → `populateProcessEnv()` → 権限チェック
3. 権限/APIキー不足 → Setup ウィンドウ表示。すべて OK → `createWindow()` で robot ウィンドウ起動 + `launchClaudePty()` で Claude Code PTY を事前起動
4. セッションなし → Login ウィンドウ表示

### ウィンドウ一覧

| 変数 | ハッシュ | 役割 |
|------|---------|------|
| `win` | `#` (デフォルト) | メインロボット（透過・click-through） |
| `chatWin` | `#chat` | チャット履歴表示（透過・click-through） |
| `loginWin` | `#login` | ログイン画面 |
| `setupWin` | `#setup` | 権限セットアップ画面 |
| `settingsWin` | `#settings` | 設定画面 |
| `displayWin` | `#display` | メール/カレンダー/タスク表示パネル（右側） |
| `searchWin` | `#search` | 検索パネル |
| `weatherWin` | `#weather` | 天気パネル |
| `emailDetailWin` | `#email-detail` | メール詳細ビュー |
| `webWin` | — | 外部 URL の Web ビュー |
| `loadingWin` | `#loading` | 起動中スプラッシュ |

### Voice loop (`src/renderer/hooks/useGeminiLive.ts`)

1. Gemini Live セッションを開く（モデル: `MODELS.geminiLive = gemini-3.1-flash-live-preview`）。音声モダリティ、ボイス `Kore`、日本語システムプロンプト、`secretaryTools` 関数宣言リスト付き。
2. 16 kHz で `getUserMedia` → PCM を `sendRealtimeInput` に流す。**`isPTTActiveRef.current` が true のときのみ送信**。マイクストリームは常時オープン。PTT がゲートする。
3. PTT は main process イベント `ptt-start` / `ptt-stop` で駆動。離すと短い無音バッファを送りGemini VAD に発話終了を通知。PTT 最小保持時間 1000ms（誤タップ防止）。
4. 受信した `serverContent.modelTurn.parts[].inlineData` は base64 PCM 24 kHz。`playbackCtxRef` + `nextPlayTimeRef` で順次スケジュール。
5. `toolCall.functionCalls` を `electronAPI.callTool(name, args)` で main process へ転送 → `sendToolResponse` で返す。
6. ロボット状態（`idle | listening | speaking | thinking`）を `sendRobotState` で main に送り、会話中は放浪を停止。

### Claude エージェント (`src/main/agent/claude.ts`)

Gemini が `delegate_task` を呼ぶと main process で `runClaudeTask()` が実行される。

- **バックエンド選択**: `settingsStore.claudeBackend` が `"api"` なら Anthropic SDK (`claude-sonnet-4-6`)、`"cli"` なら Claude Code CLI（`claudePty.ts` 経由）
- **ツール共有**: Claude エージェントも `executeTool()` (dispatcher) を呼ぶ。同じツールセットを Gemini と共有。
- **PTY 事前起動**: 起動時に `launchClaudePty()` で Claude Code CLI を温めておく（最初の呼び出しのコールドスタートを回避）

### Global hotkey & permissions (macOS-specific)

PTT は `uiohook-napi` で左 Option キーをグローバルキャプチャ。macOS **Accessibility** 権限が必要。`setupPTT()` が `isTrustedAccessibilityClient(true)` でプロンプトを出し、権限なしでも PTT なしモードで起動を継続する。

- 左 Option のみ（右 Option `3640` は意図的に除外）
- Alt+Shift でリージョンキャプチャオーバーレイを表示
- 誤 keyup デバウンス: 80ms 以内に keydown が来たらキャンセル
- スタックタイマー: 30秒 PTT 押しっぱなし検出で強制解除

### Window behavior

`transparent: true, frame: false, alwaysOnTop: true, hasShadow: false`。`setIgnoreMouseEvents(true, { forward: true })` でクリックスルー（右クリックのみ有効 → コンテキストメニュー）。放浪インターバルは 50ms tick で指数イージング + 最低速度 60px/s。

### Skills system (`src/config/skills.ts`)

スキルは `SKILL_REGISTRY` で管理。各スキルはツール名リスト・有効/無効デフォルト・必要シークレットを持つ。ユーザーごとに Turso DB へ保存（`skillToggles`）。

**スキル一覧**: gmail / calendar / tasks / drive / weather / web_search / open_app / keyboard / timer / shell / screen / memory / dashboard / apple_music（nordvpn は SKILL_REGISTRY 未登録だが dispatcher に実装済み）

### Tool dispatch (`src/main/skills/dispatcher.ts`)

**ツール名の二重管理（重要）**：
- `toolSchemas` (`dispatcher.ts`) — Anthropic SDK ツール定義（Claude エージェント用）
- `secretaryTools` (`src/config/tools.ts`) — Gemini Live 関数宣言（renderer 用）
- `executeTool()` switch ブランチ — 実装

3つを常に同期すること。スキルを追加したときは3か所すべてに追加が必要。

### Authentication & API keys

- **ログイン**: Turso 上のバックエンド API でメールアドレス認証。セッショントークンを macOS Keychain に保存（`keytar`）。
- **APIキー保存**: `src/main/auth/apiKeyStore.ts` が Turso DB の `api_keys` テーブルに暗号化保存。起動時 `populateProcessEnv()` で `process.env` に展開。
- **KNOWN_API_KEYS**: `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `TICKTICK_ACCESS_TOKEN` など。Settings UI から変更可能。変更は即座に `process.env` にも反映される。
- **.env.local**: 開発時やフォールバック用。prod では `~/Library/Application Support/robot-secretary/` に置く。DB キーが優先される。

### Google OAuth (`src/main/google/oauthFlow.ts`)

- ローカルホストのコールバックサーバーを立てて OAuth flow を完了する。
- トークンは `googleTokenStore.ts` 経由で Turso DB に保存（per user）。
- `initGoogleAuth(userId, db)` で起動時に初期化し、各スキルが `getGoogleAuth(email)` で利用する。
- Settings → Googleアカウントから追加/削除可能。`google-accounts:add/remove/list` IPC。

### Settings (`src/main/auth/settingsStore.ts`)

Turso DB の `settings` テーブルに保存。スキーマ：`language`, `robot_size`, `default_apps` (JSON), `skill_toggles` (JSON), `claude_backend`。`loadSettings()` / `saveSettings(partial)` でアクセス。

### Memory system (`src/main/memory/`)

- `store.ts` — `Memory` 型（facts / preferences / ongoing_topics / procedures / session_summaries）を Turso DB に保存・読み込み。
- `summarizer.ts` — Gemini Flash Lite でセッションサマリーを生成。
- `index.ts` — `initMemory()` / `shutdownMemory()` のライフサイクル管理。

### Display panel (`src/main/display/`)

- `show-panel.ts` — `showPanel(type, opts)` でデータフェッチ → `displayWin` に IPC 送信。`flushPending()` で起動前にキューされた payload を吐き出す。
- `registry.ts` — `displayWin` ファクトリを登録。Claude エージェントと Gemini の両方が同じウィンドウを使えるよう共有。

### Shell / PTY (`src/main/skills/shell/`)

- `shellPty.ts` — `execInShellPty()` でシェルコマンドを node-pty で実行（タイムアウト・バッファリング付き）
- `pty.ts` — PTY インスタンス管理（`ptyKillAll()` でシャットダウン時に全 PTY を終了）
- `claudePty.ts` — Claude Code CLI 専用 PTY。`launchClaudePty()` で事前起動してコールドスタートを回避。

### Configuration: split between two stores

設定の二重管理（注意）：

- **Turso DB** — Settings UI で変更したキー・設定（言語、ロボットサイズ、スキルトグル、Claude バックエンド、Google トークン、API キー）。起動時 `populateProcessEnv()` で `process.env` に反映される。
- **`.env` / `.env.local`** — 開発時または DB 未設定時のフォールバック。Tool modules は `process.env` を読むので、DB のキーと `.env` のキーは起動後に統合されている。

UI からキーを設定した場合、`process.env` への反映は `set-secret` IPC ハンドラが即座に行う。

### TypeScript configs

`tsconfig.json` はプロジェクト参照ルート。`tsconfig.node.json`（main + preload + vite config）と `tsconfig.web.json`（renderer）を指す。

### 3D robot asset

`RobotScene.tsx` が `/assets/robot.glb` を `useGLTF` でロード。実ファイルは `src/renderer/public/assets/robot.glb`（Vite public-dir）。エミッシブマテリアルは `emissiveIntensity = 6` + `toneMapped = false`（bloom HDR 用）。

### Models (`src/config/models.ts`)

| 定数 | 値 | 用途 |
|------|----|------|
| `MODELS.geminiLive` | `gemini-3.1-flash-live-preview` | 音声ループ |
| `MODELS.geminiMemorySummarizer` | `gemini-2.5-flash-lite` | メモリ要約 |
| `MODELS.claudeDelegate` | `claude-sonnet-4-6` | Claude エージェント |

### DefaultTransporter patch (`pnpm patch`)

`googleapis-common` が `google-auth-library` の `DefaultTransporter` を使うが、pnpm パッチは top-level にのみ適用される。electron-builder は pnpm virtual store から asar を作るためパッチなし版が入る。`build:app` 冒頭の `patch:pnpm` スクリプトで回避。`pnpm install` 後は再度 `npm run build:app` が必要。

## Private skills (`src/private/`)

`src/private/main-skills/` と `src/private/renderer-skills/` は外部には公開しない有料/非公開スキル。構造は `src/main/skills/` / `src/renderer/skills/` と同じ。`src/private/main-skills/dispatcher.ts` が独自の `executeTool` を持ち、main dispatcher からフォールバックで呼ばれる。

## Logging rules

### ロガーの仕組み

`src/main/logger.ts` がログ基盤。起動時に `initLogger(path)` を1回呼び（`index.ts` 冒頭）、`console.log/warn/error` をパッチして `~/Library/Application Support/robot-secretary/debug.log` へ自動追記する。ログは 5MB 超で `.1` にローテーション。

### 新しいモジュールへのロガー追加

**mainプロセスのファイルでは必ず `createLogger` を使う。** 生の `console.*` は書かない。

```ts
import { createLogger } from '../logger' // パスは適宜調整

const log = createLogger('モジュール名')

// 使用例
log.log('処理完了:', result)
log.warn('想定外の状態:', state)
log.error('fetch failed:', e)   // ← catch ブロックでは必ずこれ
```

`createLogger` は内部で `console.*` を呼ぶため、monkey-patch 経由でファイルに書き込まれる。

### ルール

1. **catch ブロックは必ず `log.error` を呼ぶ** — エラーを握りつぶさない

   ```ts
   // Bad
   try { ... } catch { /* 無視 */ }

   // Good
   const log = createLogger('nordvpn')
   try { ... } catch (e) { log.error('connect failed:', e) }
   ```

2. **エラーオブジェクトをそのまま渡す** — `e.message` だけでなく `e` ごと渡してスタックトレースを残す

   ```ts
   // Bad
   log.error('failed:', (e as Error).message)

   // Good
   log.error('failed:', e)
   ```

3. **モジュール名は短く一意にする** — `grep '[nordvpn]' debug.log` で絞れるようにするため

   既存モジュール名: `auth`, `env`, `settings`, `PTT:main`, `Permission`, `call-tool`, `notification`, `memory`, `regionCapture`, `gmail`, `calendar`, `tasks`, `open_app`, `nordvpn`, `notifications`, `apiKeyStore`, `settingsStore`

4. **rendererのエラーはそのまま `console.error` を使う** — `forwardRendererConsole()` が `[renderer:ラベル]` として debug.log に転送する

### debug.log の確認方法

```bash
tail -f ~/Library/Application\ Support/robot-secretary/debug.log
```

## Notes on user-facing strings

UI labels, the Gemini system prompt, and console warnings are all in Japanese. Keep new user-facing strings consistent with that unless explicitly asked otherwise.
