import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = __dirname
const hasPrivateSubmodule = existsSync(resolve(root, 'src/private/main-skills/dispatcher.ts'))

const optionalPrivateAliases = hasPrivateSubmodule
  ? {}
  : {
      '../../private/main-skills/dispatcher': resolve(root, 'src/private-stubs/main-skills/dispatcher.ts'),
      '../../private/renderer-skills/ai-news/View': resolve(root, 'src/private-stubs/renderer-skills/ai-news/View.tsx'),
      '../../private/renderer-skills/best-tools/View': resolve(root, 'src/private-stubs/renderer-skills/best-tools/View.tsx'),
      '../../private/renderer-skills/movies/View': resolve(root, 'src/private-stubs/renderer-skills/movies/View.tsx'),
    }

export default defineConfig({
  main: {
    resolve: {
      alias: optionalPrivateAliases,
    },
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: optionalPrivateAliases,
    },
    plugins: [react()],
  },
})
