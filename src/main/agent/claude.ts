import Anthropic from '@anthropic-ai/sdk'
import { toolSchemas, executeTool } from '../tools/dispatcher'
import { captureScreen } from '../screenshot'
import { LIMITS, MODELS } from '../../config/models'

const SYSTEM_PROMPT = `お前は「ベガ」の作業実行エージェントだ。
音声側のベガから委任された作業を、提供されたツールで実行する。

【出力ルール】
- 結果は事実ベースの簡潔な日本語で1〜3文。
- 口調は淡々とでいい。音声側が独自の口調で読み上げる。
- 数値や固有名詞は読み上げやすい形にする。
- 必要なら複数ツールを並列で呼んでよい。
- 失敗したら原因を1文で報告する。

【メール確認ルール】
- メールを問われたら get_gmail_inbox を引数なし（または maxResults だけ指定）で呼び、登録されている全 Gmail アカウントを横断してインボックスを確認する。未読の有無は基本気にしない。account を指定して1アカウントに絞るのは「○○のアカウントだけ見て」と明示されたときだけ。
- 結果はアカウント別にインボックス件数を伝え、重要そうなもの（セキュリティ通知・締切・チェックイン・支払い保留など）は中身も要約する。広告やニュースレターはまとめて「他N件はプロモーション」と省略してよい。

【メール整理ルール】
- 「○○のメール削除して」「ゴミ箱に入れて」 → trash_gmail。30日後に Google 側で自動削除されるが、それまでは復元可。完全削除はサポートしない（する必要があれば本人にGmailで操作してもらう）。
- 「○○アーカイブして」「インボックスから外して」 → archive_gmail。INBOX ラベルが外れるだけでメール本体は残る。
- どちらも事前に get_gmail_inbox で id と account を取得してから呼ぶ。複数件まとめて処理可。
- 削除/アーカイブは元に戻しづらい操作なので、対象が明確に特定できないとき（「広告系全部」など曖昧な指示）は対象一覧を読み上げて確認してから実行する。逆に「この前のAmazonの通知」のように直前に話題に出たメールが特定できる場合は確認せず実行してよい。

【予定確認ルール】
- 「今日の予定」なら get_calendar_events（range 省略=today）、「明日」なら range: tomorrow、「来週」「今週」「今後N日」なら range: upcoming で days を指定（最大14）。
- 全 Google アカウントの primary カレンダーを横断する。同じ会議が複数アカウントに招かれていても重複は除去済み。
- 終日予定と時刻あり予定を区別して読み上げる。例:「終日: 〇〇／14時から: △△」。場所があれば添える。

【タスク確認ルール】
- TickTick が唯一のタスクソース。「やること」「ToDo」「タスク」と聞かれたら get_tasks で全プロジェクト横断取得。
- タスク追加は create_task。期限が明示されたら due (YYYY-MM-DD) を渡す。「重要」「急ぎ」と言われたら priority: high。
- 完了報告は complete_task に taskId と projectId を渡す。両方は事前に get_tasks で取得した値を使う。

【タスク更新ルール】
- 期限・タイトル・優先度を変えるには update_task(taskId, projectId, ...)。due は YYYY-MM-DD または null（期限解除）。事前に get_tasks で値を確認してから呼ぶ。

【メール返信ルール】
- 返信には reply_gmail(account, messageId, body) を使う。呼び出すと確認ダイアログが表示され、ユーザーが「実行」を押した場合のみ送信される。キャンセルされたら cancelled: true が返る。
- 本文は日本語で自然な文体で書く。送信先・件名は元メールから自動引き継ぎ。
- account と messageId は事前に get_gmail_inbox で取得すること。

【カレンダーイベント作成ルール】
- 新規イベントは create_calendar_event(title, startDateTime, endDateTime, ...)。
- startDateTime/endDateTime は ISO 8601（例: "2026-05-01T15:00:00"）または終日なら YYYY-MM-DD + allDay: true。
- attendees にメールアドレスを渡すと招待メールが送られる前に確認ダイアログが出る。
- account 省略で最初の Google アカウント、timeZone 省略で Asia/Tokyo。

【天気確認ルール】
- get_weather(location) で現在の天気と3日間の予報を取得。location は日本語地名でOK。

【ダッシュボード確認ルール】
- 「今日のニュース」「AIで何かあった」「最近のAI」 → get_dashboard_entry skill=ai-news
- 「おすすめツール」「最近のツール」「何か新しいツール」 → get_dashboard_entry skill=best-tools
- 「映画」「最近何やってる」「公開中の映画」 → get_dashboard_entry skill=movies
- 「支出」「今月いくら使った」「家計」 → get_dashboard_entry skill=spending
- id は省略でいい（最新が返る）。特定日を聞かれたときだけ id: YYYY-MM-DD を指定。
- data の中の items / nowPlaying / categories などの配列は全部読み上げず、上位 2〜3 件を要約して伝える。金額・本数・日付などの数値は丸めず正確に。`


const MAX_ITERATIONS = LIMITS.claudeMaxIterations
const MODEL = MODELS.claudeDelegate

function buildDateContext(): string {
  const now = new Date()
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const city = tz.split('/').pop()?.replace(/_/g, ' ') ?? tz
  const dateStr = now.toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: tz,
  })
  const timeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: tz })
  return `【現在の状況】\n- 日時: ${dateStr} ${timeStr}\n- タイムゾーン: ${tz}（デフォルト地名: "${city}"）`
}

export async function runClaudeTask(opts: {
  task: string
  includeScreenshot?: boolean
}): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return 'ANTHROPIC_API_KEY が設定されてねえ。.env.local に書いとけ'
  }

  let client: Anthropic
  try {
    client = new Anthropic()
  } catch (err) {
    return `Anthropic クライアント初期化失敗: ${String(err)}`
  }

  const userContent: Anthropic.ContentBlockParam[] = [{ type: 'text', text: opts.task }]
  if (opts.includeScreenshot) {
    try {
      const shot = await captureScreen()
      userContent.push({
        type: 'image',
        source: { type: 'base64', media_type: shot.mediaType, data: shot.base64 },
      })
    } catch (err) {
      userContent.push({ type: 'text', text: `（スクショ取得失敗: ${String(err)}）` })
    }
  }

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userContent }]

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let res: Anthropic.Message
    try {
      res = await client.messages.create({
        model: MODEL,
        max_tokens: LIMITS.claudeMaxTokens,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high' },
        system: [
          { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: buildDateContext() },
        ],
        tools: toolSchemas,
        messages,
      })
    } catch (err) {
      return `Claude 呼び出し失敗: ${String(err)}`
    }

    messages.push({ role: 'assistant', content: res.content })

    if (res.stop_reason === 'end_turn') {
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('\n')
        .trim()
      return text || '作業は終わったが返す内容がねえ'
    }

    if (res.stop_reason === 'tool_use') {
      const toolUses = res.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      )
      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUses.map(async (tu): Promise<Anthropic.ToolResultBlockParam> => {
          try {
            const result = await executeTool(tu.name, tu.input as Record<string, unknown>)
            return {
              type: 'tool_result',
              tool_use_id: tu.id,
              content: JSON.stringify(result),
            }
          } catch (err) {
            return {
              type: 'tool_result',
              tool_use_id: tu.id,
              content: String(err),
              is_error: true,
            }
          }
        })
      )
      messages.push({ role: 'user', content: toolResults })
      continue
    }

    break
  }

  return 'ループ上限に達した。作業途中で止めた'
}
