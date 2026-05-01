import { getDashboardEntry } from '../shared/turso'
export type { EntryResult } from '../shared/turso'

export async function getMovies(id?: string) {
  return getDashboardEntry('movies', id)
}
