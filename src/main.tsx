import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import AppRoot from "./components/scada/AppRoot"; // 👈 esta ruta

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppRoot />
  </React.StrictMode>
);

import { getApiBase, telemetryWsUrl, getApiKey } from "./lib/api";

console.log("[CFG]", {
  apiBase: getApiBase(),
  wsUrl: telemetryWsUrl(),
  apiKeySet: !!getApiKey(),
});
