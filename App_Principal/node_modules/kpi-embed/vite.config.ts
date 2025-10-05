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
    proxy: {
      // Todo lo que sea /api/... lo proxyeamos al backend
      "/api": {
        target: API_URL,        // ← incluye /infra
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            // Log útil para ver a dónde va realmente
            // console.log("[proxy] ->", proxyReq.protocol, proxyReq.host, proxyReq.path);

            // Auth: en query (si así lo configuraste)
            if (AUTH_IN_QUERY && API_KEY) {
              const url = new URL(proxyReq.path, "http://dummy");
              if (!url.searchParams.has("key")) {
                url.searchParams.set("key", API_KEY);
              }
              proxyReq.path = url.pathname + url.search;
            }

            // Siempre pasá org_id si no vino
            const u2 = new URL(proxyReq.path, "http://dummy");
            if (ORG_ID && !u2.searchParams.has("org_id")) {
              u2.searchParams.set("org_id", ORG_ID);
              proxyReq.path = u2.pathname + u2.search;
            }
          });
        },
        // Reescribimos /api/foo -> /infra/foo (porque target ya tiene /infra)
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
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
