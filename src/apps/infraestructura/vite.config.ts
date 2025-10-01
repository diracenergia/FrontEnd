// vite.config.ts
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isProd = mode === 'production'

  // Podés sobreescribir con VITE_HOST / VITE_PORT si querés.
  const DEV_HOST = env.VITE_HOST || '127.0.0.1'
  const DEV_PORT = Number(env.VITE_PORT) || 5181
  const PREV_PORT = Number(env.VITE_PREVIEW_PORT) || DEV_PORT

  return {
    // En dev servimos en '/', en prod podés ajustar el subpath si hace falta.
    base: isProd ? '/FrontEnd/infraestructura/' : '/',

    plugins: [react()],

    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },

    server: {
      host: DEV_HOST,          // ← evita el lío IPv6 vs IPv4
      port: DEV_PORT,          // ← 5181 por defecto
      strictPort: true,        // si está ocupado, falla (no autoshift)
      open: true,
      headers: {
        'Access-Control-Allow-Origin': '*',
        // Para que el shell pueda embeber por iframe en dev:
        'X-Frame-Options': 'ALLOWALL',
        'Content-Security-Policy': 'frame-ancestors *'
      }
    },

    preview: {
      host: DEV_HOST,
      port: PREV_PORT
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
