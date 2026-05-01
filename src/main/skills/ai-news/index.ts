export { getDashboardEntry } from '../shared/turso'
export type { EntryResult } from '../shared/turso'

import { getDashboardEntry } from '../shared/turso'

export async function getAiNews(id?: string) {
  return getDashboardEntry('ai-news', id)
}
