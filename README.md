# Robot Secretary

Electron + React + Three.js desktop app.

## Setup

Use the pinned pnpm version through `npx` so another machine uses the same package manager version without a global install:

```bash
npx pnpm@10.33.0 install --frozen-lockfile
```

Run the app:

```bash
npx pnpm@10.33.0 run dev
```

Build:

```bash
npx pnpm@10.33.0 run build
```

Do not use `npm install` for this repository. The dependency graph is locked with `pnpm-lock.yaml`.
