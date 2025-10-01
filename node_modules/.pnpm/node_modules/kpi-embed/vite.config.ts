// kpi/vite.config.ts
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isProd = mode === 'production'

  // DEV host/puertos
  const DEV_HOST = env.VITE_HOST || '127.0.0.1'
  const DEV_PORT = Number(env.VITE_PORT || 5174)
  const PREV_PORT = Number(env.VITE_PREVIEW_PORT || 4174)

  // En prod esta micro-app vive bajo /kpi/
  const PUBLIC_BASE = env.VITE_PUBLIC_BASE_PATH || '/kpi/'

  // Padres permitidos para <iframe>
  const FRAME_ANCESTORS =
    env.VITE_FRAME_ANCESTORS ||
    " 'self' http://127.0.0.1:5173 http://localhost:5173 https://front-end-ebon-xi.vercel.app"

  return {
    // 👇 En prod, emite assets relativos a /kpi/
    base: isProd ? PUBLIC_BASE : '/',

    plugins: [react()],

    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
      dedupe: ['react', 'react-dom'],
    },

    server: {
      host: DEV_HOST,
      port: DEV_PORT,
      strictPort: true,
      open: false,
      cors: true,
      headers: {
        'Access-Control-Allow-Origin': '*',
        // NO usar X-Frame-Options ALLOWALL; CSP manda:
        'Content-Security-Policy': `frame-ancestors${FRAME_ANCESTORS}`,
        // (opcional) si servís fuentes/imagenes cross-origin:
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
      // HMR estable dentro de iframe
      hmr: {
        host: DEV_HOST,
        port: DEV_PORT,
        protocol: 'ws',
      },
    },

    preview: {
      host: DEV_HOST,
      port: PREV_PORT,
      strictPort: true,
      cors: true,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Security-Policy': `frame-ancestors${FRAME_ANCESTORS}`,
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
    },

    build: {
      outDir: 'dist',
      target: 'esnext',
      sourcemap: !isProd,
      emptyOutDir: true,
    },

    define: {
      __APP_VERSION__: JSON.stringify(env.VITE_APP_VERSION || 'dev'),
    },
  }
})
