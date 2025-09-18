// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env': '{}',
    global: 'window',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'), // <-- alias @ a /src
    },
  },
  build: {
    lib: {
      entry: 'src/widget.tsx',
      name: 'KpiWidget',
      fileName: (format) => `kpi-widget.${format}.js`,
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      external: [],
      output: { globals: {} },
    },
  },
})
