import { useState, useEffect } from 'react'
import { CYAN, MAGENTA, FONT_MONO } from '../display/styles'
import { DisplayShell } from '../display/DisplayShell'

type SearchResult = { title: string; url: string; snippet: string }
type SearchData = { answer: string | null; results: SearchResult[] }

export function SearchApp() {
  const [data, setData] = useState<SearchData | null>(null)
  const [fetchedAt, setFetchedAt] = useState(0)

  useEffect(() => {
    const off = window.electronAPI?.onSearchData((raw) => {
      setData(raw as SearchData)
      setFetchedAt(Date.now())
    })
    return () => off?.()
  }, [])

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        overflow: 'hidden',
        background: 'transparent',
      }}
    >
      <DisplayShell
        label="◢ SEARCH // WEB"
        fetchedAt={fetchedAt || undefined}
        onClose={() => window.electronAPI?.searchClose()}
      >
        {!data ? (
          <Standby />
        ) : (
          <>
            {data.answer && <AnswerBox answer={data.answer} />}
            {data.results.map((r, i) => (
              <ResultCard key={i} result={r} onOpen={(url) => window.electronAPI?.openWebView(url)} />
            ))}
            {data.results.length === 0 && <EmptyResults />}
          </>
        )}
      </DisplayShell>
    </div>
  )
}

function Standby() {
  return (
    <div
      style={{
        fontFamily: FONT_MONO,
        fontSize: 11,
        letterSpacing: 3,
        color: 'rgba(0, 240, 255, 0.3)',
        textAlign: 'center',
        marginTop: 60,
      }}
    >
      STANDBY
    </div>
  )
}

function AnswerBox({ answer }: { answer: string }) {
  return (
    <div
      style={{
        padding: '10px 14px',
        background: 'linear-gradient(135deg, rgba(0, 240, 255, 0.06), rgba(255, 43, 214, 0.04))',
        border: `1px solid rgba(0, 240, 255, 0.35)`,
        boxShadow: `0 0 14px rgba(0, 240, 255, 0.1)`,
        fontFamily: FONT_MONO,
        fontSize: 12,
        lineHeight: 1.6,
        color: '#d0f4ff',
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 2,
          color: CYAN,
          textShadow: `0 0 6px ${CYAN}`,
          marginBottom: 6,
        }}
      >
        ◈ AI SUMMARY
      </div>
      {answer}
    </div>
  )
}

function ResultCard({ result, onOpen }: { result: SearchResult; onOpen: (url: string) => void }) {
  const domain = (() => {
    try { return new URL(result.url).hostname.replace('www.', '') }
    catch { return result.url }
  })()

  return (
    <div
      style={{
        padding: '10px 14px 12px',
        background: 'linear-gradient(135deg, rgba(8, 12, 24, 0.97), rgba(18, 8, 28, 0.97))',
        border: `1px solid rgba(0, 240, 255, 0.18)`,
        boxShadow: '0 0 10px rgba(0, 240, 255, 0.05)',
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
      }}
    >
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 12,
          fontWeight: 700,
          color: '#e8f6ff',
          lineHeight: 1.4,
        }}
      >
        {result.title}
      </div>
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 11,
          lineHeight: 1.55,
          color: 'rgba(200, 220, 240, 0.7)',
        }}
      >
        {result.snippet.length > 160 ? result.snippet.slice(0, 160) + '…' : result.snippet}
      </div>
      <button
        onClick={() => onOpen(result.url)}
        style={{
          alignSelf: 'flex-start',
          fontFamily: FONT_MONO,
          fontSize: 9.5,
          letterSpacing: 0.5,
          color: CYAN,
          textShadow: `0 0 6px ${CYAN}`,
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          textDecoration: 'underline',
          textUnderlineOffset: 3,
        }}
      >
        ↗ {domain}
      </button>
    </div>
  )
}

function EmptyResults() {
  return (
    <div
      style={{
        fontFamily: FONT_MONO,
        fontSize: 11,
        letterSpacing: 2,
        color: `rgba(255, 43, 214, 0.5)`,
        textAlign: 'center',
        marginTop: 40,
      }}
    >
      NO RESULTS
    </div>
  )
}

// MAGENTA を参照してlinterを黙らせる（将来の拡張用）
void MAGENTA
