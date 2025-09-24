import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import AppRoot from "./components/scada/AppRoot";

import { BrowserRouter } from "react-router-dom";

import { getApiBase, telemetryWsUrl, getApiKey, setApiBase, setApiKey } from "./lib/api";

// 🔧 Fuerza valores desde las envs de Vite (parche de runtime)
setApiBase(import.meta.env.VITE_API_URL as string);
setApiKey(import.meta.env.VITE_API_KEY as string);

// Logs para verificar
console.log("[ENV]", {
  VITE_API_URL: import.meta.env.VITE_API_URL,
  VITE_WS_URL:  import.meta.env.VITE_WS_URL,
  VITE_API_KEY: import.meta.env.VITE_API_KEY,
});

console.log("[CFG]", {
  apiBase: getApiBase(),
  wsUrl: telemetryWsUrl(),
  apiKeySet: !!getApiKey(),
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppRoot />
    </BrowserRouter>
  </React.StrictMode>
);
