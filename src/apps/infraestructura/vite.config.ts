// infraestructura/vite.config.ts
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isProd = mode === 'production'

  // Dev host/puertos (podés sobreescribir con VITE_HOST / VITE_PORT)
  const DEV_HOST = env.VITE_HOST || '127.0.0.1'
  const DEV_PORT = Number(env.VITE_PORT) || 5181
  const PREV_PORT = Number(env.VITE_PREVIEW_PORT) || DEV_PORT

  // Allowlist de padres para <iframe> en dev/preview
  // Ej: VITE_FRAME_ANCESTORS="http://127.0.0.1:5173 http://localhost:5173"
  const FRAME_ANCESTORS =
    env.VITE_FRAME_ANCESTORS ||
    'http://127.0.0.1:5173 http://localhost:5173'

  return {
    // 🔴 En prod servimos bajo subruta fija
    base: isProd ? '/infraestructura/' : '/',

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
        // ✅ Usar CSP frame-ancestors (no X-Frame-Options)
        'Content-Security-Policy': `frame-ancestors ${FRAME_ANCESTORS}`,
        // opcional si servís assets cruzados
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
      // HMR estable en iframes
      hmr: { host: DEV_HOST, port: DEV_PORT, protocol: 'ws' },
    },

    preview: {
      host: DEV_HOST,
      port: PREV_PORT,
      cors: true,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Security-Policy': `frame-ancestors ${FRAME_ANCESTORS}`,
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
    },

    build: {
      outDir: 'dist',
      target: 'esnext',
      sourcemap: !isProd,
    },

    define: {
      __APP_VERSION__: JSON.stringify(env.VITE_APP_VERSION || 'dev'),
    },
  }
})
