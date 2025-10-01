// infraestructura/vite.config.ts
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isProd = mode === 'production'

  // DEV host/puertos
  const DEV_HOST = env.VITE_HOST || '127.0.0.1'
  const DEV_PORT = Number(env.VITE_PORT || 5181)
  const PREV_PORT = Number(env.VITE_PREVIEW_PORT || 4181)

  // En prod esta micro-app vive bajo /infraestructura/
  const PUBLIC_BASE = env.VITE_PUBLIC_BASE_PATH || '/infraestructura/'

  return {
    // 👇 En prod, emite assets relativos a /infraestructura/
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

      // Headers solo para DEV: permiten que el shell (5173) embe­ba por <iframe>
      headers: {
        'Access-Control-Allow-Origin': '*',
        // NO usar X-Frame-Options ALLOWALL (no existe). CSP manda:
        'Content-Security-Policy':
          "frame-ancestors 'self' http://localhost:5173 http://127.0.0.1:5173",
        // (opcional) si servís fuentes/imágenes cross-origin dentro del iframe
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },

      // HMR estable desde dentro del iframe
      hmr: {
        host: DEV_HOST,
        port: DEV_PORT,
        protocol: 'ws',
      },

      // Útil con OneDrive/antivirus
      watch: { usePolling: true, interval: 200 },
    },

    preview: {
      host: DEV_HOST,
      port: PREV_PORT,
      strictPort: true,
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
