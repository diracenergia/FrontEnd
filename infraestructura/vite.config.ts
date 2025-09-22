// infraestructura/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

const isProd = process.env.NODE_ENV === 'production'

export default defineConfig({
  // En desarrollo sirve en raíz ("/"), en producción bajo subpath "/FrontEnd/infraestructura/"
  base: isProd ? '/FrontEnd/infraestructura/' : '/',

  plugins: [react()],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  server: {
    port: 5174,
    strictPort: true,
    open: false,
    // Proxy para evitar CORS en dev
    proxy: {
      '/api': {
        target: 'http://localhost:8000', // FastAPI dev
        changeOrigin: true,
      },
    },
  },

  preview: {
    port: 5175,
    strictPort: true,
  },

  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          recharts: ['recharts'],
        },
      },
    },
  },

  envPrefix: 'VITE_',
})
