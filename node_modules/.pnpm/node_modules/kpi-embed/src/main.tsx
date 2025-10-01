// kpi/src/main.tsx
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import KpiWidget from "./widget";
import { initEmbed, waitForCtx, onCtx } from "./embed";
import { applyKpiCtx } from "./lib/kpiConfig";   // 👈 nuevo

initEmbed();

function Root() {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let unsub = () => {};
    (async () => {
      try {
        const ctx = await waitForCtx({ timeout: 4000, needApiBase: true });
        applyKpiCtx(ctx);  // 👈 guardamos el ctx inicial (org/ubicación) en window.__KPI_CTX__
        console.info("[KPI] ctx listo:", ctx);
      } catch (e) {
        console.warn("[KPI] ctx no llegó a tiempo; sigo con lo que haya", e);
      }

      // Cambios de contexto desde el host
      unsub = onCtx((next) => {
        applyKpiCtx(next); // 👈 actualizamos runtime ctx
        setVersion((v) => v + 1); // re-mount para refetch global
        window.dispatchEvent(new CustomEvent("rdls:ctx-changed", { detail: next }));
        console.info("[KPI] ctx cambió:", next);
      });
    })();

    return () => { try { unsub(); } catch {} };
  }, []);

  return (
    <React.StrictMode>
      <KpiWidget key={version} title="Tablero de KPIs" />
    </React.StrictMode>
  );
}

function bootstrap() {
  createRoot(document.getElementById("root")!).render(<Root />);
}
bootstrap();
