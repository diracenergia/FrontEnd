// vite.config.ts
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Carga variables del .env (opcional)
  const env = loadEnv(mode, process.cwd(), '')
  const isProd = mode === 'production'

  return {
    // En dev: '/', en prod: tu subcarpeta de deploy
    // Cambiá este string si tu app se sirve en otra ruta
    base: isProd ? '/FrontEnd/infraestructura/' : '/',

    plugins: [react()],

    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },

    server: {
      port: Number(env.VITE_PORT) || 5173,
      host: true,
      open: true,
    },

    preview: {
      port: Number(env.VITE_PREVIEW_PORT) || 4173,
      host: true,
    },

    build: {
      outDir: 'dist',
      target: 'esnext',
      sourcemap: !isProd,
      // vacía outDir antes de compilar (por defecto true en Vite 5)
      // emptyOutDir: true,
    },

    // Ejemplo: inyectar constantes de build (opcional)
    define: {
      __APP_VERSION__: JSON.stringify(env.VITE_APP_VERSION || 'dev'),
    },
  }
})
