export const FONT_MONO =
  '"JetBrains Mono", "SF Mono", "Cascadia Code", "Roboto Mono", ui-monospace, monospace'

export const CYAN = '#00f0ff'
export const MAGENTA = '#ff2bd6'

export const CYBER_STYLES = `
@keyframes cyber-scan {
  0% { background-position: 0 0; }
  100% { background-position: 0 6px; }
}
@keyframes cyber-flicker {
  0%, 100% { opacity: 1; }
  46% { opacity: 1; }
  47% { opacity: 0.55; }
  49% { opacity: 1; }
  72% { opacity: 0.85; }
  74% { opacity: 1; }
}
@keyframes cyber-blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}
@keyframes cyber-card-enter {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes cyber-shimmer {
  0%   { background-position: -100% 0; }
  100% { background-position: 200% 0; }
}
@keyframes cyber-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes cyber-skeleton-pulse {
  0%, 100% { opacity: 0.3; }
  50%       { opacity: 0.6; }
}
@keyframes cyber-pulse-dot {
  0%, 100% { opacity: 1;   box-shadow: 0 0 6px #00ff88, 0 0 14px rgba(0,255,136,0.5); }
  50%       { opacity: 0.5; box-shadow: 0 0 3px #00ff88, 0 0 6px rgba(0,255,136,0.3); }
}
.cyber-msg {
  position: relative;
  padding: 10px 14px 11px;
  font-family: ${FONT_MONO};
  font-size: 12.5px;
  line-height: 1.55;
  word-break: break-word;
  color: #e8f6ff;
  letter-spacing: 0.2px;
  background: linear-gradient(135deg, rgba(8, 12, 24, 0.97), rgba(18, 8, 28, 0.97));
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  clip-path: polygon(
    10px 0,
    100% 0,
    100% calc(100% - 10px),
    calc(100% - 10px) 100%,
    0 100%,
    0 10px
  );
  animation: cyber-card-enter 0.22s ease-out both;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}
.cyber-msg:hover {
  transform: translateY(-2px);
}
.cyber-msg::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    0deg,
    rgba(255, 255, 255, 0.04) 0px,
    rgba(255, 255, 255, 0.04) 1px,
    transparent 1px,
    transparent 3px
  );
  mix-blend-mode: overlay;
  opacity: 0.2;
}
.cyber-msg::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    105deg,
    transparent 30%,
    rgba(255, 255, 255, 0.055) 50%,
    transparent 70%
  );
  background-size: 250% 100%;
  background-position: -100% 0;
  opacity: 0;
  transition: opacity 0.3s ease;
}
.cyber-msg:hover::after {
  opacity: 1;
  animation: cyber-shimmer 1.5s ease-in-out infinite;
}
.cyber-msg-user {
  border: 1px solid ${CYAN};
  background:
    linear-gradient(90deg, rgba(0, 240, 255, 0.07) 0%, transparent 40%),
    linear-gradient(135deg, rgba(8, 12, 24, 0.97), rgba(18, 8, 28, 0.97));
  box-shadow:
    0 0 0 1px rgba(0, 240, 255, 0.15),
    0 0 18px rgba(0, 240, 255, 0.35),
    inset 0 0 22px rgba(0, 240, 255, 0.08);
}
.cyber-msg-user:hover {
  box-shadow:
    0 0 0 1px rgba(0, 240, 255, 0.35),
    0 0 32px rgba(0, 240, 255, 0.65),
    inset 0 0 30px rgba(0, 240, 255, 0.14),
    0 6px 24px rgba(0, 0, 0, 0.5);
}
.cyber-msg-ai {
  border: 1px solid ${MAGENTA};
  background:
    linear-gradient(90deg, rgba(255, 43, 214, 0.07) 0%, transparent 40%),
    linear-gradient(135deg, rgba(8, 12, 24, 0.97), rgba(18, 8, 28, 0.97));
  box-shadow:
    0 0 0 1px rgba(255, 43, 214, 0.15),
    0 0 18px rgba(255, 43, 214, 0.35),
    inset 0 0 22px rgba(255, 43, 214, 0.08);
}
.cyber-msg-ai:hover {
  box-shadow:
    0 0 0 1px rgba(255, 43, 214, 0.35),
    0 0 32px rgba(255, 43, 214, 0.65),
    inset 0 0 30px rgba(255, 43, 214, 0.14),
    0 6px 24px rgba(0, 0, 0, 0.5);
}
.cyber-tag {
  font-family: ${FONT_MONO};
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  margin-bottom: 4px;
  opacity: 0.95;
}
.cyber-tag-user {
  color: ${CYAN};
  text-shadow: 0 0 8px rgba(0, 240, 255, 0.7);
  align-self: flex-end;
}
.cyber-tag-ai {
  color: ${MAGENTA};
  text-shadow: 0 0 8px rgba(255, 43, 214, 0.7);
  align-self: flex-start;
}
.cyber-caret {
  display: inline-block;
  width: 7px;
  height: 12px;
  margin-left: 2px;
  vertical-align: -1px;
  background: ${MAGENTA};
  box-shadow: 0 0 6px ${MAGENTA};
  animation: cyber-blink 1s steps(1) infinite;
}
.cyber-scroll { scrollbar-width: none; }
.cyber-scroll::-webkit-scrollbar { width: 0; height: 0; display: none; }
.cyber-status-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #00ff88;
  box-shadow: 0 0 6px #00ff88, 0 0 14px rgba(0, 255, 136, 0.5);
  animation: cyber-pulse-dot 2s ease-in-out infinite;
  flex-shrink: 0;
}
`
