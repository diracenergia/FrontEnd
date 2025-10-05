// vite.config.ts (App_1)
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const isProd = process.env.NODE_ENV === "production";

export default defineConfig({
  base: isProd ? "/kpi/" : "/",        // 👈 importante
  plugins: [react()],
  server: { port: 5174, strictPort: true },
  resolve: { alias: { "@": "/src" } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: { react: ["react", "react-dom"], recharts: ["recharts"] }
      }
    }
  },
  envPrefix: "VITE_",
});
