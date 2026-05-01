import { getDashboardEntry } from '../shared/turso'
export type { EntryResult } from '../shared/turso'

export async function getBestTools(id?: string) {
  return getDashboardEntry('best-tools', id)
}
