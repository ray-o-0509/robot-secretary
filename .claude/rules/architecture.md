# Architecture Rules

## Directory Layout

```
src/
├── main/           # Electron main process (Node.js)
│   ├── skills/     # Public tool implementations
│   │   ├── shared/ # Shared utilities (auth, validation)
│   │   └── dispatcher.ts  # Routes tool calls; lazy-loads private
│   ├── display/    # Panel data fetching + IPC push
│   └── agent/      # Anthropic agent loop
├── preload/        # contextBridge surface only
├── renderer/       # React UI
│   ├── skills/     # Per-skill React views + prompt.md
│   ├── display/    # DisplayApp + panel views
│   └── locales/    # i18n JSON (en, ja, zh)
└── private/        # Git submodule — optional, never import statically
    ├── main-skills/
    └── renderer-skills/
```

## Process Boundaries

- **main → renderer**: IPC only (`webContents.send` / `ipcRenderer.on`). Never import renderer code from main.
- **renderer → main**: `window.electronAPI.*` (contextBridge). Never call Node APIs directly.
- **preload**: only re-exports; no business logic.

## Skill Placement Rules

| Skill type | Location |
|---|---|
| Publicly available (Gmail, Calendar, Tasks, Weather, Web Search) | `src/main/skills/<name>/` + `src/renderer/skills/<name>/` |
| Private / paid-data skills (ai-news, best-tools, movies, turso) | `src/private/main-skills/<name>/` + `src/private/renderer-skills/<name>/` |

**Never move a private skill into the public tree.** If a skill requires `src/private/`, it stays private.

## Adding a New Public Skill

1. `src/main/skills/<name>/index.ts` — implementation
2. Add tool schema + `case` to `src/main/skills/dispatcher.ts`
3. `src/renderer/skills/<name>/View.tsx` — panel view (if it has a display panel)
4. `src/renderer/skills/<name>/prompt.md` — skill prompt fragment
5. Import `prompt.md` in `src/renderer/hooks/prompts/index.ts`
6. Register panel type in `src/main/display/show-panel.ts` + `src/renderer/display/types.ts` if adding a new panel

## Adding a New Private Skill

Same steps, but under `src/private/main-skills/<name>/` and `src/private/renderer-skills/<name>/`. Register in `src/private/main-skills/dispatcher.ts`, not the public one.
