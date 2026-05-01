import { CYAN, FONT_MONO, MAGENTA } from '../../display/styles'
import { EmptyState } from '../../display/components/EmptyState'
import { ErrorState } from '../../display/components/ErrorState'
import type { DashboardPayload, Movie, MoviesData, PanelPayload } from '../../display/types'

interface Props {
  payload: PanelPayload
}

export function MoviesView({ payload }: Props) {
  if (payload.error) {
    return <ErrorState message={payload.error} hint="TURSO_DATABASE_URL を .env.local で確認" />
  }

  const wrap = payload.data as DashboardPayload<MoviesData> | null
  if (!wrap || 'error' in wrap) {
    return <ErrorState message={(wrap as { error: string } | null)?.error ?? '取得失敗'} />
  }
  const data = wrap.data
  const nowPlaying = data?.nowPlaying ?? []
  const upcoming = data?.upcoming ?? []

  if (nowPlaying.length === 0 && upcoming.length === 0) {
    return <EmptyState message="映画情報なし" />
  }

  return (
    <>
      {wrap.subtitle && (
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 10,
            letterSpacing: 1.5,
            color: 'rgba(0, 240, 255, 0.7)',
            marginBottom: 4,
          }}
        >
          {wrap.id} — {wrap.subtitle}
        </div>
      )}

      {nowPlaying.length > 0 && (
        <Section title={`今月公開中 (${nowPlaying.length})`}>
          {nowPlaying.map((m, i) => (
            <MovieCard key={`now-${i}`} movie={m} showRating />
          ))}
        </Section>
      )}

      {upcoming.length > 0 && (
        <Section title={`来月注目 (${upcoming.length})`}>
          {upcoming.map((m, i) => (
            <MovieCard key={`up-${i}`} movie={m} />
          ))}
        </Section>
      )}
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 1.5,
          color: CYAN,
          textShadow: `0 0 6px ${CYAN}80`,
          marginTop: 6,
          paddingBottom: 4,
          borderBottom: `1px solid ${CYAN}30`,
        }}
      >
        ▸ {title}
      </div>
      {children}
    </div>
  )
}

function MovieCard({ movie, showRating }: { movie: Movie; showRating?: boolean }) {
  const wrapperStyle: React.CSSProperties = {
    display: 'flex',
    gap: 10,
    padding: '10px 12px',
    background: 'linear-gradient(135deg, rgba(8, 12, 24, 0.97), rgba(18, 8, 28, 0.97))',
    border: `1px solid ${CYAN}40`,
    boxShadow: '0 0 12px rgba(0, 240, 255, 0.15)',
    clipPath:
      'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
    color: 'inherit',
    textDecoration: 'none',
  }

  const inner = (
    <>
      {movie.posterUrl && (
        <img
          src={movie.posterUrl}
          alt=""
          style={{
            width: 60,
            height: 90,
            objectFit: 'cover',
            flexShrink: 0,
            borderRadius: 3,
            background: '#000',
          }}
          onError={(e) => {
            ;(e.currentTarget as HTMLImageElement).style.display = 'none'
          }}
        />
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: FONT_MONO,
                fontSize: 11.5,
                fontWeight: 700,
                color: '#e8f6ff',
                lineHeight: 1.35,
              }}
            >
              {movie.titleJa || movie.title}
            </div>
            {movie.titleJa && movie.title !== movie.titleJa && (
              <div
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 9.5,
                  color: 'rgba(232, 246, 255, 0.5)',
                  marginTop: 1,
                }}
              >
                {movie.title}
              </div>
            )}
          </div>
          {showRating && movie.rating != null && (
            <span
              style={{
                flexShrink: 0,
                fontFamily: FONT_MONO,
                fontSize: 11,
                fontWeight: 700,
                color: '#ffc83c',
                textShadow: '0 0 6px rgba(255, 200, 60, 0.6)',
              }}
            >
              ★ {Number(movie.rating).toFixed(1)}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
          {movie.releaseDate && (
            <span style={{ fontFamily: FONT_MONO, fontSize: 9.5, color: 'rgba(232, 246, 255, 0.55)' }}>
              ▸ {movie.releaseDate}
            </span>
          )}
          {movie.popularity != null && (
            <span style={{ fontFamily: FONT_MONO, fontSize: 9.5, color: MAGENTA, opacity: 0.85 }}>
              ↑ {Math.round(movie.popularity)}
            </span>
          )}
        </div>

        {movie.genre && movie.genre.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
            {movie.genre.map((g, i) => (
              <span
                key={i}
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 8.5,
                  letterSpacing: 0.5,
                  color: 'rgba(232, 246, 255, 0.6)',
                  background: 'rgba(0, 240, 255, 0.06)',
                  padding: '1px 5px',
                  border: `1px solid ${CYAN}25`,
                }}
              >
                {g}
              </span>
            ))}
          </div>
        )}

        {movie.overview && (
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 10,
              color: 'rgba(232, 246, 255, 0.6)',
              lineHeight: 1.5,
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {movie.overview}
          </div>
        )}
      </div>
    </>
  )

  return movie.url ? (
    <a href={movie.url} target="_blank" rel="noopener noreferrer" style={wrapperStyle}>
      {inner}
    </a>
  ) : (
    <div style={wrapperStyle}>{inner}</div>
  )
}
