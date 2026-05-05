# Robot Secretary — アプリ概要

## 概要

Robot Secretary は macOS 向けのデスクトップ AI アシスタントアプリ。透明なウィンドウで浮かぶ 3D ロボットが、Gemini Live による音声会話で Gmail・Google Calendar・TickTick・Drive などを操作する。

## スタック

| 層 | 技術 |
|---|---|
| フレームワーク | Electron + electron-vite |
| UI | React + Three.js / React Three Fiber |
| AI 音声 | Gemini Live (WebSocket, 音声↔音声) |
| AI エージェント | Claude API (delegate_task ツール) |
| DB | Turso (libSQL) |
| 認証 | Google OAuth 2.0 |

## プロセス構成

```
main process (Node.js)
  ├─ IPC ハンドラ / ツール実行
  ├─ PTT グローバルホットキー (uiohook-napi)
  ├─ 浮遊アニメーション (wandering)
  └─ Turso DB / Keychain 管理

preload (contextBridge)
  └─ window.electronAPI を renderer に公開

renderer (React)
  ├─ RobotScene.tsx — Three.js 3D ロボット
  ├─ useGeminiLive.ts — 音声ループ
  └─ settings / setup / login / overlay ルート
```

## ディレクトリ構成

```
src/
  main/
    auth/           認証・DB・暗号化モジュール
    google/         Google OAuth フロー
    ipc/            IPC ハンドラ登録
    memory/         会話メモリ (store.ts)
    skills/         各スキル実装 (gmail, calendar, ...)
    display/        パネル表示
  preload/          contextBridge
  renderer/
    components/     RobotScene, StatusBanner, ChatPanel
    hooks/          useGeminiLive
    settings/       設定画面 (SettingsApp.tsx)
    login/          ログイン画面
    overlay/        領域選択オーバーレイ
  config/           SkillRegistry (skills.ts)
scripts/
  schema-bootstrap.sql  ブートストラップ DB スキーマ
  schema-user.sql       ユーザー DB スキーマ
  migrate-*.ts          移行スクリプト
docs/
  overview.md       このファイル
  architecture.md   DB・認証アーキテクチャ
  skills.md         スキル一覧
  setup.md          セットアップ手順
```

## 主要な動作フロー

### 起動

1. `.env.local` からブートストラップ DB 接続情報を読み込む
2. Keychain のセッショントークン確認 → なければログイン画面表示
3. Google OAuth でサインイン → `user_registry` でユーザー DB URL を取得
4. ユーザー専用 DB に接続、API キーを復号して `process.env` に注入
5. マイク権限チェック → 問題なければロボット起動

### PTT (Push-to-Talk)

- 左 Option キーを押している間だけ音声を Gemini Live に送信
- `uiohook-napi` でグローバルキーをキャプチャ (Accessibility 権限が必要)
- Alt + Shift = 領域選択モード (スクリーンショット付き送信)

### ツール実行フロー

```
Gemini → toolCall → IPC call-tool → dispatcher.ts → 各スキル
                                                  ↓
                              結果を sendToolResponse で Gemini に返す
```
