# Private / Public Boundary

`src/private/` is a git submodule. Public code must build and run correctly without it.

## Hard Rules

### Never statically import from `src/private/`

```ts
// BAD — breaks public-only builds at compile time
import { NewsView } from '../../private/renderer-skills/ai-news/View'
import { getDashboardEntry } from '../../private/main-skills/shared/turso'
```

### Main process: import only the private dispatcher

```ts
// GOOD — Rollup bundles the private dispatcher when present.
// electron.vite.config.ts aliases this path to a public stub when src/private is absent.
async function loadPrivate() {
  try {
    const priv = await import('../../private/main-skills/dispatcher')
    // use priv.toolSchemas, priv.executeTool
  } catch {
    // private not available, continue without it
  }
}
```

Route all private panel data through the private `dispatcher.ts`, not by importing private shared utilities directly (e.g. `turso`) from public files.

Do not add new public imports of private internals. If a public file must reference a private entrypoint, add a matching stub in `src/private-stubs/` and an alias in `electron.vite.config.ts`; otherwise public-only builds fail during Rollup module resolution before runtime `try/catch` can run.

### Renderer: React.lazy through aliased private entrypoints

```tsx
// GOOD — bundles the private view when present, or the public stub alias when absent
const NewsView = lazy(() =>
  import('../../private/renderer-skills/ai-news/View')
    .then((m) => ({ default: m.NewsView }))
    .catch(() => ({ default: () => <div>この機能は利用できません</div> })),
)

// In JSX:
<Suspense fallback={null}>
  <NewsView payload={payload} />
</Suspense>
```

## Import Path Reference

From `src/main/skills/dispatcher.ts` to private main dispatcher:
```
../../private/main-skills/dispatcher
```

From `src/main/display/show-panel.ts` to private turso:
```
Do not import this. Call executeTool('get_dashboard_entry', ...) instead.
```

From `src/renderer/display/DisplayApp.tsx` to private renderer views:
```
../../private/renderer-skills/<name>/View
```

**Why:** The private submodule path is `src/private/`. From any file in `src/main/skills/`, you go up two levels (`../../`) to reach `src/`, then into `private/`. Getting this wrong causes build failures with "Could not resolve". Runtime `try/catch` does not protect missing static import specifiers during production builds; optional private entrypoints need the stubs and aliases above.
