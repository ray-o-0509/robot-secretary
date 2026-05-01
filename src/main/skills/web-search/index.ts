const TAVILY_API_URL = 'https://api.tavily.com/search'

export async function webSearch(query: string): Promise<unknown> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) throw new Error('TAVILY_API_KEY is not set')
  const res = await fetch(TAVILY_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query, max_results: 5 }),
  })
  if (!res.ok) throw new Error(`Tavily error: ${res.status}`)
  const data = (await res.json()) as {
    results: { title: string; url: string; content: string }[]
    answer?: string
  }
  return {
    answer: data.answer ?? null,
    results: data.results.map((r) => ({ title: r.title, url: r.url, snippet: r.content })),
  }
}
