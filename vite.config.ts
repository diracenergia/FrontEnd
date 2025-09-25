// vite.config.ts (APP)
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Podés sobreescribir con VITE_HOST / VITE_PORT si querés
  const HOST = env.VITE_HOST || '127.0.0.1'  // evitá líos IPv6 vs IPv4
  const PORT = Number(env.VITE_PORT) || 5172 // cambiá si 5172 está ocupado

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
      // Tu setting original (útil si trabajás en OneDrive/WSL/docker)
      watch: { usePolling: true, interval: 200 },
    },

    // Para `pnpm preview`
    preview: {
      host: HOST,
      port: PORT,
    },
  }
})
