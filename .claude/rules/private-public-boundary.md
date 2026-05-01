# Private / Public Boundary

`src/private/` is a git submodule. Public code must build and run correctly without it.

## Hard Rules

### Never statically import from `src/private/`

```ts
// BAD — breaks public-only builds at compile time
import { NewsView } from '../../private/renderer-skills/ai-news/View'
import { getDashboardEntry } from '../../private/main-skills/shared/turso'
```

### Main process: dynamic import inside try/catch

```ts
// GOOD — Rollup bundles when present; runtime try/catch handles absence
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

### Renderer: React.lazy + catch fallback

```tsx
// GOOD — renders fallback when private is absent
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
../../private/main-skills/shared/turso
```

From `src/renderer/display/DisplayApp.tsx` to private renderer views:
```
../../private/renderer-skills/<name>/View
```

**Why:** The private submodule path is `src/private/`. From any file in `src/main/skills/`, you go up two levels (`../../`) to reach `src/`, then into `private/`. Getting this wrong causes build failures with "Could not resolve".
