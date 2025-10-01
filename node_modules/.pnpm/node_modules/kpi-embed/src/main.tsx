// kpi/src/main.tsx
import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import KpiWidget from "./widget";
import { initEmbed, waitForCtx } from "./embed";

initEmbed();

async function bootstrap() {
  try {
    const ctx = await waitForCtx({ timeout: 4000, needApiBase: true });
    console.info("[KPI] ctx listo:", ctx);
  } catch (e) {
    console.warn("[KPI] ctx no llegó a tiempo; sigo con lo que haya", e);
  }

  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <KpiWidget title="Tablero de KPIs" />
    </React.StrictMode>
  );
}
bootstrap();
