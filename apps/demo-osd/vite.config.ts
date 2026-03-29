import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  server: {
    port: 5173,
  },
  resolve: {
    alias: {
      // Point directly to TS source so Vite/HMR picks up changes without a rebuild.
      'sense-art': path.resolve(__dirname, '../../packages/sense-art/src/index.ts'),
    },
  },
})
