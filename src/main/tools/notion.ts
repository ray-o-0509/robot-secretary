import { Client } from '@notionhq/client'

function getClient() {
  const token = process.env.NOTION_API_KEY
  if (!token) throw new Error('NOTION_API_KEY が未設定です')
  return new Client({ auth: token })
}

export async function getMyTasks(status?: string) {
  const notion = getClient()
  const databaseId = process.env.NOTION_DATABASE_ID

  if (!databaseId) return { error: 'NOTION_DATABASE_ID が未設定です' }

  const filter = status
    ? {
        property: 'Status',
        status: { equals: status },
      }
    : undefined

  const res = await notion.databases.query({
    database_id: databaseId,
    filter: filter as Parameters<typeof notion.databases.query>[0]['filter'],
    sorts: [{ timestamp: 'created_time', direction: 'descending' }],
    page_size: 10,
  })

  return res.results.map((page) => {
    const props = (page as { properties: Record<string, { title?: { plain_text: string }[]; status?: { name: string }; date?: { start: string } }> }).properties
    return {
      title: props.Name?.title?.[0]?.plain_text ?? '(無題)',
      status: props.Status?.status?.name ?? '',
      due: props['Due Date']?.date?.start ?? '',
    }
  })
}

export async function createTask(title: string, dueDate?: string) {
  const notion = getClient()
  const databaseId = process.env.NOTION_DATABASE_ID

  if (!databaseId) return { error: 'NOTION_DATABASE_ID が未設定です' }

  await notion.pages.create({
    parent: { database_id: databaseId },
    properties: {
      Name: { title: [{ text: { content: title } }] },
      ...(dueDate ? { 'Due Date': { date: { start: dueDate } } } : {}),
    },
  })

  return { success: true }
}
