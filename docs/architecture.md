# DB・認証アーキテクチャ

## マルチユーザー DB 設計

### 概要

```
.env.local
  ROBOT_SECRETARY_DB_URL    ← ブートストラップ DB (全ユーザー共通)
  ROBOT_SECRETARY_DB_TOKEN
  TURSO_PLATFORM_API_TOKEN  ← Turso Platform API (新規ユーザーの DB 作成に使用)
  TURSO_ORG

macOS Keychain
  robot-secretary / master-key      ← AES-256 マスターキー (32 byte hex)
  robot-secretary / session-token   ← ログイン中ユーザーの UUID
```

### ブートストラップ DB (`robot-secretary`)

ユーザーレジストリのみ保持。

```sql
user_registry (
  id                  TEXT PRIMARY KEY,  -- UUID
  google_id           TEXT UNIQUE,       -- Google sub
  email               TEXT UNIQUE,
  display_name        TEXT,
  avatar_url          TEXT,
  db_name             TEXT,              -- e.g. "rs-ba529e16"
  db_url              TEXT,              -- libsql://rs-ba529e16-...
  db_token_ciphertext TEXT               -- AES-256-GCM 暗号化済み DB トークン
)
```

### ユーザー専用 DB (`rs-{uuid8}`)

ユーザーごとに独立したデータベース。`user_id` カラム不要。

```sql
api_keys       (id, key_name UNIQUE, ciphertext)
settings       (id=1 singleton, language, robot_size, default_apps, skill_toggles)
google_tokens  (id, email UNIQUE, ciphertext)
memory         (id=1 singleton, facts, preferences, ongoing_topics, procedures, session_summaries)
profile        (id=1 singleton, items JSON)
conv_sessions  (id, started_at, ended_at, summarized)
transcripts    (id AUTO, session_id, role, text, ts)
```

## 暗号化

```
マスターキー (Keychain)
    ↓ SHA-256(masterKey + ':' + userId)
AES-256 ユーザーキー
    ↓ AES-256-GCM
暗号化データ (DB に保存)
```

- API キー、Google OAuthトークン、DB トークン はすべて AES-256-GCM で暗号化
- 復号キーは macOS Keychain にのみ存在するため、DB が漏洩しても単体では復号不可

## 認証フロー

```
初回ログイン:
  1. Google OAuth (loopback server + session.defaultSession.fetch)
  2. google_id で user_registry を検索 → 未登録
  3. Turso Platform API で新 DB 作成 (rs-{uuid8})
  4. schema-user.sql を適用
  5. DB トークンを暗号化して user_registry に登録
  6. session-token (userId) を Keychain に保存

2回目以降:
  1. Keychain から session-token (userId) 取得
  2. user_registry を検索 → db_url, db_token_ciphertext 取得
  3. DB トークンを復号 → ユーザー DB に接続
  4. API キーを復号して process.env に注入
```

## セキュリティモデル

| 脅威 | 対策 |
|---|---|
| DB トークンの漏洩 | API キー・Google トークンは AES-256-GCM 暗号化済み |
| 暗号化キーの漏洩 | マスターキーは macOS Keychain (Secure Enclave 保護) |
| 他ユーザーのデータ参照 | ユーザーごとに完全に独立した DB (DB-per-user) |
| セッション乗っ取り | session-token は UUID のみ、Keychain 保管 |

## 新規ユーザー追加時の流れ

異なる Google アカウントでログインすると自動的に:
1. `rs-{新UUID8}` という Turso DB が作成される
2. スキーマが適用される
3. `user_registry` に登録される
4. 以降はそのアカウントの独立した DB が使われる
