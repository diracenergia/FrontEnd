import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_URL = process.env.VITE_API_URL || "http://127.0.0.1:8000/infra";
const API_KEY = process.env.VITE_API_KEY || "";
const AUTH_IN_QUERY = String(process.env.VITE_AUTH_IN_QUERY || "false") === "true";
const ORG_ID = process.env.VITE_ORG_ID || "";

export default defineConfig({
  resolve: { alias: { "@": "/src" } },
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,                   // ← si 5180 está ocupado, falla en lugar de cambiar de puerto
    headers: {
      "Access-Control-Allow-Origin": "*",
      // por las dudas, evitar bloqueos de framing en dev:
      "X-Frame-Options": "ALLOWALL",
      "Content-Security-Policy": "frame-ancestors *"
    },
    proxy: {
      "/api": {
        target: API_URL,
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            if (AUTH_IN_QUERY && API_KEY) {
              const url = new URL(proxyReq.path, "http://dummy");
              if (!url.searchParams.has("key")) url.searchParams.set("key", API_KEY);
              proxyReq.path = url.pathname + url.search;
            }
            const u2 = new URL(proxyReq.path, "http://dummy");
            if (ORG_ID && !u2.searchParams.has("org_id")) {
              u2.searchParams.set("org_id", ORG_ID);
              proxyReq.path = u2.pathname + u2.search;
            }
          });
        },
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  preview: { port: 5180 },
  build: {
    lib: {
      entry: "src/widget.tsx",
      name: "KpiWidget",
      fileName: (format) => `kpi-widget.${format}.js`,
      formats: ["es", "umd"],
    },
    rollupOptions: { external: [], output: { globals: {} } },
  },
});
