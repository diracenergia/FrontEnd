import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Evita tener dos React cuando el widget está linkeado
    dedupe: ["react", "react-dom"],
  },
  server: {
    // En OneDrive/Windows a veces el watcher falla; polling lo hace más robusto
    watch: { usePolling: true, interval: 200 },
  },
});
