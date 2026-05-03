# Robot Secretary — VEGA

A transparent, always-on-top floating 3D robot that lives on your macOS desktop and acts as a real-time voice assistant. Powered by Gemini Live, it can manage your email, calendar, tasks, and more — all hands-free.

![Electron](https://img.shields.io/badge/Electron-32-47848F?logo=electron)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![Three.js](https://img.shields.io/badge/Three.js-r3f-black?logo=threedotjs)
![Gemini](https://img.shields.io/badge/Gemini-Live-4285F4?logo=google)
![Platform](https://img.shields.io/badge/Platform-macOS-000000?logo=apple)

---

## What it does

VEGA is a snarky robot secretary that floats on your screen and listens when you hold the **left Option key** (Push-to-Talk). It speaks back in real-time audio and can:

| Category | Capabilities |
|---|---|
| 📧 Gmail | Read inbox, search emails, archive, trash, reply |
| 📅 Google Calendar | View today/tomorrow/week, create events |
| ✅ TickTick | List, create, complete, and update tasks |
| 🔔 Notifications | Read macOS notification banners and announce them when idle |
| 🌤 Weather | Current conditions and 3-day forecast |
| 🔍 Web search | Live search with results displayed in a panel |
| 🖥 Screen analysis | Screenshot + Claude vision for "what's on my screen?" |
| 📱 App launcher | Open any app by voice, with configurable defaults per category |
| 💻 Shell | Run commands and Claude Code from voice |
| 🧠 Memory | Remembers facts about you across sessions via profile + conversation summaries |

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  macOS Desktop (always-on-top, transparent) │
│                                             │
│   ┌──────────┐   ┌─────────────────────┐   │
│   │ Chat     │   │  3D Robot (r3f)     │   │
│   │ Panel    │   │  VEGA               │   │
│   └──────────┘   └─────────────────────┘   │
│                                             │
│   ┌─────────────────────────────────────┐   │
│   │  Display Panel (email/cal/tasks)    │   │
│   └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
          ↕ IPC (contextBridge)
┌─────────────────────────────────────────────┐
│  Electron Main Process                      │
│  ├── Gemini Live session (voice loop)       │
│  ├── Tool dispatcher (Gmail/Cal/TickTick)   │
│  ├── Claude agent (complex tasks)           │
│  ├── Notification watcher (log stream)      │
│  └── Memory store (profile + summaries)     │
└─────────────────────────────────────────────┘
```

**Three Electron processes:**

- **`src/main/index.ts`** — BrowserWindow management, PTT hotkey, wandering animation, IPC dispatcher
- **`src/preload/index.ts`** — `window.electronAPI` bridge via `contextBridge`
- **`src/renderer/`** — React app; `useGeminiLive.ts` owns the voice loop

---

## Requirements

- macOS (arm64, tested on Sequoia 26.x)
- Node.js ≥ 25.9.0
- pnpm 10.33.0
- A [Gemini API key](https://aistudio.google.com/app/apikey)

---

## Setup

### 1. Install dependencies

```bash
npx pnpm@10.33.0 install --frozen-lockfile
```

> Do **not** use `npm install` — the dependency graph is locked with `pnpm-lock.yaml`.

### 2. Configure API keys

Create `.env.local` in the project root:

```env
GEMINI_API_KEY=AIza...
ANTHROPIC_API_KEY=sk-ant-...      # for Claude agent (screen analysis, complex tasks)
TICKTICK_ACCESS_TOKEN=...          # TickTick OAuth token
TURSO_DATABASE_URL=libsql://...    # daily-dashboard DB (optional)
TURSO_AUTH_TOKEN=...               # (optional)
```

For production builds, copy this file to the app's userData directory:

```bash
cp .env.local ~/Library/Application\ Support/robot-secretary/.env.local
```

### 3. Google OAuth (Gmail & Calendar)

Run the auth script for each account:

```bash
node scripts/auth-google.mjs your@gmail.com
```

Save the output to:

```
~/.config/robot-secretary/google-tokens/your@gmail.com.json
```

### 4. Run in development

```bash
npm run dev
```

---

## Building & Installing

```bash
npm run build:app
```

This builds the app and installs it to `/Applications/Robot Secretary.app` (no DMG, fast).

Then restart:

```bash
pkill -x "Robot Secretary"
open "/Applications/Robot Secretary.app"
```

> ⚠️ **Run `build:app` from an interactive terminal**, not from a script or CI. If run non-interactively, electron-builder can't access the Keychain and falls back to ad-hoc signing — which causes macOS to reset Accessibility permissions on every build.

---

## macOS Permissions

On first launch, the app checks for required permissions and shows a setup screen if anything is missing.

| Permission | Purpose | Required |
|---|---|---|
| Microphone | Voice input | ✅ Yes |
| Accessibility | Push-to-Talk (left Option key) | Recommended |
| Screen Recording | Screen analysis via `analyze_screen` | Optional |

To reset permissions (e.g. after a bundle ID change):

```bash
tccutil reset Microphone com.rayotsuka.robot-secretary
tccutil reset Accessibility com.rayotsuka.robot-secretary
tccutil reset ScreenCapture com.rayotsuka.robot-secretary
```

---

## Usage

| Action | How |
|---|---|
| **Talk to VEGA** | Hold **left Option** → speak → release |
| **Open settings** | Right-click the robot, or **Cmd+,** when app is focused |
| **Stop wandering** | Right-click → "移動を止める" |
| **Mute** | Right-click → "ミュート" |
| **Quit** | Right-click → "終了", or **Cmd+Q** |

### Settings (Cmd+,)

- **Profile** — Persistent facts VEGA remembers about you (name, job, preferences). Also updated automatically when you say "remember that…"
- **Default Apps** — Which app opens when you say "open email" / "open browser" etc. without specifying a name
- **API Keys** — Gemini API key

---

## Notification Awareness

VEGA monitors macOS notifications in the background via `log stream` + Accessibility API:

- **When idle** — announces incoming notifications immediately ("Hey, you got an email from…")
- **During conversation** — buffers notifications and announces them when the conversation ends
- **Before Gemini connects** — buffers from app launch and delivers on first session connect

No extra permissions required beyond Accessibility (already needed for PTT).

---

## Project Structure

```
src/
├── main/
│   ├── index.ts              # Main process, window management, PTT
│   ├── ipc/
│   │   └── registerCoreIpc.ts  # All IPC handlers
│   ├── tools/
│   │   ├── gmail.ts          # Gmail read/send/search
│   │   ├── calendar.ts       # Google Calendar
│   │   ├── ticktick.ts       # TickTick tasks
│   │   ├── notifications.ts  # macOS notification watcher
│   │   ├── openApp.ts        # App launcher with default resolution
│   │   ├── defaultApps.ts    # Default app config persistence
│   │   ├── weather.ts        # Open-Meteo weather
│   │   ├── search.ts         # Web search
│   │   └── shell.ts          # Shell + Claude Code runner
│   ├── agent/
│   │   └── claude.ts         # Claude sub-agent for complex tasks
│   └── memory/
│       ├── store.ts          # Profile + session + memory persistence
│       └── summarizer.ts     # Post-session memory summarization
├── preload/
│   └── index.ts              # contextBridge API surface
└── renderer/
    ├── App.tsx               # Route switcher (#setup / #settings / #chat / …)
    ├── hooks/
    │   └── useGeminiLive.ts  # Gemini Live voice loop (central piece)
    ├── components/
    │   ├── RobotScene.tsx    # Three.js / r3f robot
    │   ├── ChatPanel.tsx     # Conversation transcript
    │   └── ConfirmationCard.tsx
    ├── display/              # Email / calendar / tasks panel
    ├── settings/             # Settings window (Cmd+,)
    └── setup/               # First-run setup screen
```

---

## Tech Stack

| Layer | Tech |
|---|---|
| Shell | Electron 32 |
| UI | React 18 + TypeScript |
| 3D | Three.js via `@react-three/fiber` |
| Voice AI | Google Gemini Live (`gemini-2.0-flash-live-001`) |
| Task AI | Anthropic Claude (`claude-sonnet-4-5`) |
| Build | electron-vite + electron-builder |
| Package manager | pnpm 10 |
| Google APIs | `googleapis` with OAuth2 refresh tokens |
| Task manager | TickTick REST API |
| DB | Turso / libSQL (read-only dashboard data) |

---

## License

MIT
