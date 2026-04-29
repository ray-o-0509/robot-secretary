import type { RobotState } from '../App'

const FONT_MONO =
  '"JetBrains Mono", "SF Mono", "Cascadia Code", "Roboto Mono", ui-monospace, monospace'

type Theme = { color: string; label: string; prefix: string }

const themes: Partial<Record<RobotState, Theme>> = {
  listening: { color: '#ff2bd6', label: 'LISTENING',  prefix: '◉ REC' },
  thinking:  { color: '#00ff9d', label: 'PROCESSING', prefix: '◇ CPU' },
  speaking:  { color: '#ffd200', label: 'TRANSMIT',   prefix: '▶ TX'  },
}

const BANNER_STYLES = `
@keyframes banner-pulse {
  0%, 100% { box-shadow: 0 0 12px var(--c, #fff), 0 0 28px rgba(255,255,255,0.25), inset 0 0 18px rgba(255,255,255,0.08); }
  50%      { box-shadow: 0 0 22px var(--c, #fff), 0 0 48px rgba(255,255,255,0.45), inset 0 0 24px rgba(255,255,255,0.16); }
}
@keyframes banner-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.4; transform: scale(0.7); }
}
@keyframes banner-bar {
  0%   { transform: scaleY(0.3); }
  50%  { transform: scaleY(1); }
  100% { transform: scaleY(0.3); }
}
.banner-root {
  position: absolute;
  top: 14px;
  left: 16px;
  font-family: ${FONT_MONO};
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  padding: 7px 16px 7px 12px;
  background: linear-gradient(135deg, rgba(8, 10, 22, 0.97), rgba(20, 6, 28, 0.97));
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--c, #fff);
  color: var(--c, #fff);
  text-shadow: 0 0 6px var(--c, #fff);
  display: flex;
  align-items: center;
  gap: 10px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 10;
  clip-path: polygon(
    8px 0,
    100% 0,
    100% calc(100% - 8px),
    calc(100% - 8px) 100%,
    0 100%,
    0 8px
  );
  animation: banner-pulse 1.6s ease-in-out infinite;
}
.banner-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--c, #fff);
  box-shadow: 0 0 8px var(--c, #fff);
  animation: banner-dot 0.9s ease-in-out infinite;
}
.banner-bars {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 10px;
  margin-left: 4px;
}
.banner-bars > span {
  display: inline-block;
  width: 2px;
  height: 100%;
  background: var(--c, #fff);
  box-shadow: 0 0 4px var(--c, #fff);
  transform-origin: center;
  animation: banner-bar 0.7s ease-in-out infinite;
}
.banner-bars > span:nth-child(2) { animation-delay: 0.12s; }
.banner-bars > span:nth-child(3) { animation-delay: 0.24s; }
.banner-bars > span:nth-child(4) { animation-delay: 0.36s; }
.banner-prefix { opacity: 0.85; font-size: 10px; letter-spacing: 1.5px; }
`

export function StatusBanner({ state }: { state: RobotState }) {
  const theme = themes[state]
  if (!theme) return null

  return (
    <>
      <style>{BANNER_STYLES}</style>
      <div
        className="banner-root"
        style={{ ['--c' as string]: theme.color } as React.CSSProperties}
      >
        <span className="banner-dot" />
        <span className="banner-prefix">{theme.prefix}</span>
        <span>{theme.label}</span>
        <span className="banner-bars" aria-hidden>
          <span /><span /><span /><span />
        </span>
      </div>
    </>
  )
}
