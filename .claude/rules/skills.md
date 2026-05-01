# Skill Conventions

A "skill" is a self-contained feature unit with consistent structure across both main and renderer layers.

## Public Skill File Layout

```
src/main/skills/<name>/
  index.ts          # Implementation; exports named functions
src/renderer/skills/<name>/
  View.tsx          # Panel view component (if skill has a display panel)
  prompt.md         # Prompt fragment describing the skill to the AI
```

The prompt fragment is imported in `src/renderer/hooks/prompts/index.ts` and concatenated into the system prompt at runtime.

## Dispatcher Sync Rule

`src/main/skills/dispatcher.ts` has two parts that must stay in sync:

1. `publicToolSchemas` — Anthropic `Tool[]` array
2. `executeTool` switch — one `case` per schema name

When adding a tool: add **both** the schema entry and the `case`. When removing: remove both. A schema with no `case` causes a runtime error; a `case` with no schema means the AI never calls the tool.

The same applies to `src/private/main-skills/dispatcher.ts` for private skills.

## Panel Type Sync Rule

Adding a display panel requires changes in four places:

| File | Change |
|---|---|
| `src/main/display/show-panel.ts` | Add `case` to `fetchPanelData` + `buildSummary` |
| `src/main/display/show-panel.ts` | Add type to `PanelType` union + `VALID_TYPES` set |
| `src/renderer/display/types.ts` | Add label in `PANEL_LABELS` |
| `src/renderer/display/DisplayApp.tsx` | Add `case` to `renderView` |

Missing any one of these causes a TypeScript error or a panel that silently shows nothing.

## Prompt Fragment Rules

- One `prompt.md` per skill, in the skill's folder (`src/renderer/skills/<name>/prompt.md` or `src/renderer/display/prompt.md` for display)
- Write in English; persona language files (`src/renderer/hooks/prompts/persona/`) handle output language only
- Keep each fragment focused on what the skill can do and when to use it — no persona or formatting instructions

## Locale Completeness

UI translation files live in `src/renderer/locales/{en,ja,zh}.json`. Language options shown in `ChatPanel.tsx` must have a corresponding locale file.

**If adding a new language:**
1. Create `src/renderer/locales/<lang>.json` with all keys
2. Register it in the i18next `resources` config
3. Only then add it to the `LANGUAGES` array in `ChatPanel.tsx`

**Never add a language to the selector without the locale file.** It silently falls back to a different language in the UI while the AI speaks the new language — inconsistent UX.
