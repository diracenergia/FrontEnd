import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isProd = mode === 'production'
  const DEV_HOST = env.VITE_HOST || '127.0.0.1'
  const DEV_PORT = Number(env.VITE_PORT) || 5174
  const PREV_PORT = Number(env.VITE_PREVIEW_PORT) || 4174
  const FRAME_ANCESTORS = env.VITE_FRAME_ANCESTORS || 'http://127.0.0.1:5173 http://localhost:5173'

  return {
    base: isProd ? '/kpi/' : '/',
    plugins: [react()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }, dedupe: ['react','react-dom'] },
    server: {
      host: DEV_HOST, port: DEV_PORT, strictPort: true, cors: true,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Security-Policy': `frame-ancestors ${FRAME_ANCESTORS}`,
        'Cross-Origin-Resource-Policy': 'cross-origin'
      },
      hmr: { host: DEV_HOST, port: DEV_PORT, protocol: 'ws' }
    },
    preview: {
      host: DEV_HOST, port: PREV_PORT, cors: true,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Security-Policy': `frame-ancestors ${FRAME_ANCESTORS}`,
        'Cross-Origin-Resource-Policy': 'cross-origin'
      }
    },
    build: { outDir: 'dist', target: 'esnext', sourcemap: !isProd }
  }
})
