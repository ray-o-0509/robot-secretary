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
.cyber-msg-user {
  border: 1px solid ${CYAN};
  box-shadow:
    0 0 0 1px rgba(0, 240, 255, 0.15),
    0 0 18px rgba(0, 240, 255, 0.35),
    inset 0 0 22px rgba(0, 240, 255, 0.08);
}
.cyber-msg-ai {
  border: 1px solid ${MAGENTA};
  box-shadow:
    0 0 0 1px rgba(255, 43, 214, 0.15),
    0 0 18px rgba(255, 43, 214, 0.35),
    inset 0 0 22px rgba(255, 43, 214, 0.08);
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
`
