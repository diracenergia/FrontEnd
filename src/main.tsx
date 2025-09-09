import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import AppRoot from "./components/scada/AppRoot";

// 🔍 LOG 1: envs que Vite debería inyectar en el build
console.log("[ENV]", {
  VITE_API_URL: import.meta.env.VITE_API_URL,
  VITE_WS_URL:  import.meta.env.VITE_WS_URL,
  VITE_API_KEY: import.meta.env.VITE_API_KEY,
});

// ✅ Import correcto del helper (ruta relativa)
import { getApiBase, telemetryWsUrl, getApiKey } from "./lib/api";

// 🔍 LOG 2: qué está usando realmente el front en runtime
console.log("[CFG]", {
  apiBase: getApiBase(),
  wsUrl: telemetryWsUrl(),
  apiKeySet: !!getApiKey(),
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppRoot />
  </React.StrictMode>
);
