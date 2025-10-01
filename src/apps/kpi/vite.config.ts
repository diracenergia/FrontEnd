// vite.config.ts (KPI embebido)
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isProd = mode === 'production'

  // ✅ KPI en puerto propio por defecto (evita choque con shell en 5173)
  const DEV_HOST = env.VITE_HOST || '127.0.0.1'
  const DEV_PORT = Number(env.VITE_PORT) || 5174
  const PREV_PORT = Number(env.VITE_PREVIEW_PORT) || 4174

  // ✅ Allowlist de padres para <iframe>. Podés sobreescribirlo por env:
  // VITE_FRAME_ANCESTORS="http://127.0.0.1:5173 http://localhost:5173"
  const FRAME_ANCESTORS =
    env.VITE_FRAME_ANCESTORS ||
    'http://127.0.0.1:5173 http://localhost:5173'

  return {
    base: '/',
    plugins: [react()],

    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
      dedupe: ['react', 'react-dom'],
    },

    server: {
      host: DEV_HOST,
      port: DEV_PORT,
      strictPort: true,   // ❌ no “autoshift”
      open: false,
      cors: true,
      headers: {
        // CORS para cargar assets/remotos desde el shell
        'Access-Control-Allow-Origin': '*',
        // ❗ NO usar X-Frame-Options (ALLOWALL no existe). Usamos CSP:
        // Permitimos que el shell (5173) lo embeba. Sumá orígenes si hace falta.
        'Content-Security-Policy': `frame-ancestors ${FRAME_ANCESTORS}`,
        // (opcional) si servís fuentes/imagenes cross-origin:
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
      // HMR fijado al mismo origin/puerto (evita ws raros en iframes)
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
