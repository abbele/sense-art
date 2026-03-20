import { resolve } from 'path'
import { defineConfig } from 'vitest/config'
import dts from 'vite-plugin-dts'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/types/**'],
    },
  },
  plugins: [
    dts({
      include: ['src'],
      insertTypesEntry: true,
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'SenseArt',
      fileName: (format) => `sense-art.${format}.js`,
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      // openseadragon e tone sono peer deps: non bundlizzarli
      external: ['openseadragon', 'tone'],
      output: {
        globals: {
          openseadragon: 'OpenSeadragon',
          tone: 'Tone',
        },
      },
    },
    sourcemap: true,
    minify: false, // leggibile per ispezionare l'output durante lo sviluppo
  },
})
