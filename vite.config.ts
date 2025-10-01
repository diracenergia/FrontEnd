// vite.config.ts (app principal)
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const HOST = env.VITE_HOST || '127.0.0.1'
  const PORT = Number(env.VITE_PORT || 5173)

  // Puertos de micro-apps (dev)
  const KPI_PORT   = Number(env.VITE_KPI_PORT   || 5174)
  const INFRA_PORT = Number(env.VITE_INFRA_PORT || 5181)

  const isDev = mode !== 'production'

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
      dedupe: ['react', 'react-dom'],
    },
    server: {
      host: HOST,
      port: PORT,
      strictPort: true,
      open: true,
      watch: { usePolling: true, interval: 200 },

      // Proxy SOLO en dev: /apps/* → micro-apps locales
      proxy: isDev
        ? {
            // /apps/kpi/... -> 127.0.0.1:5174
            '^/apps/kpi(?:/|$)': {
              target: `http://127.0.0.1:${KPI_PORT}`,
              changeOrigin: true,
              ws: true,
              rewrite: p => p.replace(/^\/apps\/kpi/, ''),
            },
            // /apps/infra/... -> 127.0.0.1:5181
            '^/apps/infra(?:/|$)': {
              target: `http://127.0.0.1:${INFRA_PORT}`,
              changeOrigin: true,
              ws: true,
              rewrite: p => p.replace(/^\/apps\/infra/, ''),
            },
          }
        : undefined,
    },
    preview: {
      host: HOST,
      port: 4173,
      strictPort: true,
    },
    base: '/',
  }
})
