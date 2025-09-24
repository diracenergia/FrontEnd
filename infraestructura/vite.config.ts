import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  // Usá import.meta.env.PROD (propio de Vite) en lugar de process.env.NODE_ENV
  base: import.meta.env.PROD ? '/FrontEnd/infraestructura/' : '/',

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
    proxy: {
      '/infra': {
        target: 'https://backend-v85n.onrender.com',
        changeOrigin: true,
        secure: false, // opcional
      },
      '/conn': {
        target: 'https://backend-v85n.onrender.com',
        changeOrigin: true,
        secure: false,
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
