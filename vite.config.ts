// vite.config.ts
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const HOST = env.VITE_HOST || '127.0.0.1'
  const PORT = Number(env.VITE_PORT) || 5173  // ← default 5173

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
      dedupe: ['react', 'react-dom'],
    },
    server: {
      host: HOST,
      port: PORT,
      strictPort: true,
      open: true,
      watch: { usePolling: true, interval: 200 }, // si OneDrive molesta
    },
    preview: {
      host: HOST,
      port: 4173, // ← distinto al dev
    },
  }
})
