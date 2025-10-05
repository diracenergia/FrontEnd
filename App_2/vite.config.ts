// infraestructura/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

const isProd = process.env.NODE_ENV === 'production'

export default defineConfig({
  // En desarrollo sirve en raíz ("/"), en producción bajo subpath "/infraestructura/"
  base: isProd ? '/infraestructura/' : '/',

  plugins: [react()],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  // Opcional: puertos fijos para evitar choques cuando tengas ambas apps corriendo
  server: {
    port: 5175,
    strictPort: true,
    open: false,
  },
  preview: {
    port: 5175,
    strictPort: true,
  },

  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,           // ponelo en false si no necesitás debug
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Divide dependencias grandes en chunks separados
        manualChunks: {
          react: ['react', 'react-dom'],
          recharts: ['recharts'],
        },
      },
    },
  },

  // Solo expone variables que empiezan con VITE_ (default), explícito por claridad
  envPrefix: 'VITE_',
})
