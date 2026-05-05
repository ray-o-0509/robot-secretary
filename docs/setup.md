# セットアップ手順

## 必要なもの

- macOS (Apple Silicon 推奨)
- Node.js >= 25.9.0, pnpm
- Apple Developer 証明書 (署名済みビルドに必要)
- Turso アカウント + CLI
- Google Cloud Console プロジェクト (OAuth 用)

## 初期セットアップ

### 1. Turso DB の作成

```bash
turso auth login
turso db create robot-secretary --group default

# ブートストラップ DB の URL とトークンを取得
turso db show robot-secretary --url
turso db tokens create robot-secretary

# Platform API トークン (新規ユーザー DB 作成用)
turso auth api-tokens mint robot-secretary-provisioner
```

### 2. .env.local の設定

`~/.config/robot-secretary/.env.local` に以下を配置 (prod ビルド用):

```env
# ブートストラップ DB
ROBOT_SECRETARY_DB_URL=libsql://robot-secretary-<org>.aws-ap-northeast-1.turso.io
ROBOT_SECRETARY_DB_TOKEN=<token>

# Turso Platform API
TURSO_ORG=<org-slug>
TURSO_PLATFORM_API_TOKEN=<platform-token>
```

開発時はプロジェクトルートの `.env.local` に同じ内容を置く。

### 3. ブートストラップ DB スキーマ適用

```bash
turso db shell robot-secretary < scripts/schema-bootstrap.sql
```

### 4. Google Cloud Console の設定

1. OAuth 2.0 クライアント ID を作成 (デスクトップアプリ)
2. リダイレクト URI に `http://127.0.0.1` を追加
3. `client_secret.json` を `~/.config/gmail-triage/client_secret.json` に配置

### 5. ビルド & インストール

```bash
# 依存インストール
pnpm install

# ビルド + /Applications にインストール
npm run build:app
```

> **注意**: `npm run build:app` はインタラクティブなターミナルから実行すること。  
> Claude Code から実行すると署名がアドホックになりアクセシビリティ権限がリセットされる。

### 6. 初回起動

アプリを起動すると:
1. Google ログイン画面が表示される
2. Google でサインイン → 自動的にユーザー専用 Turso DB が作成される
3. 設定画面の「スキル」タブで各 API キーを入力する

## 開発環境での起動

```bash
npm run dev
```

`ELECTRON_RENDERER_URL` が HMR URL として自動設定される。

## 権限

| 権限 | 用途 |
|---|---|
| マイク | Gemini Live 音声入力 |
| アクセシビリティ | PTT グローバルホットキー (uiohook-napi) |
| 画面収録 | 画面解析・領域キャプチャ |

権限リセット:
```bash
tccutil reset Microphone com.yourname.robot-secretary
tccutil reset Accessibility com.yourname.robot-secretary
tccutil reset ScreenCapture com.yourname.robot-secretary
```

## prod ビルドの .env.local 更新

`.env.local` を変更したら prod にもコピーが必要:

```bash
cp .env.local ~/Library/Application\ Support/robot-secretary/.env.local
```
