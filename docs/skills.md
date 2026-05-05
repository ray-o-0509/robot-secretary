# スキル一覧

スキルは `src/config/skills.ts` の `SKILL_REGISTRY` で定義。設定画面からON/OFFを切り替え可能。

## コアスキル (常に有効)

| スキル | 説明 |
|---|---|
| メモリ | `update_profile`, `learn_procedure` — ユーザー情報・手順を記憶 |

## オプションスキル

| ID | ラベル | 主なツール | 必要な API キー |
|---|---|---|---|
| `gmail` | Gmail | `get_gmail_inbox`, `reply_gmail`, `search_gmail` | Google OAuth |
| `calendar` | Google Calendar | `get_calendar_events`, `create_calendar_event` | Google OAuth |
| `tasks` | TickTick | `get_tasks`, `create_task`, `complete_task` | TICKTICK_ACCESS_TOKEN |
| `drive` | Google Drive | `list_drive_recent`, `search_drive`, `read_drive_file` | Google OAuth |
| `weather` | 天気 | `get_weather` | — |
| `web_search` | Web 検索 | `web_search` | TAVILY_API_KEY |
| `open_app` | アプリ起動 | `open_app` | — |
| `keyboard` | キーボード操作 | `type_text`, `press_keys` | — |
| `timer` | タイマー | `start_timer`, `start_stopwatch` | — |
| `shell` | シェル実行 | `run_command` | — |
| `screen` | 画面解析 | `analyze_screen` | — |
| `dashboard` | ダッシュボード | `get_dashboard_entry` | TURSO_DATABASE_URL, TURSO_AUTH_TOKEN |

## AI エージェント (delegate_task)

`ANTHROPIC_API_KEY` が設定されると `delegate_task` ツールが有効になり、Claude に複雑なタスクを委任できる。

## Google OAuth 連携

設定画面の「Google」タブからアカウントを追加。`~/.config/gmail-triage/client_secret.json` が必要。

複数の Google アカウントを登録可能で、Gmail/Calendar/Drive は全アカウントをファンアウトして実行する。
