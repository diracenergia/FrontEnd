// src/components/scada/pages/KpiView.tsx
import React from "react";
import { mountKpi, unmountKpi } from "@/lib/kpi-loader";

export default function KpiView() {
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    let alive = true;

    (async () => {
      if (!ref.current) return;

      try {
        // 👇 acá va el chrome: 'none' para que el widget no pinte título ni card
        const { version } = await mountKpi(
          ref.current,
          {
            chrome: "none",
            compact: false,
            // data: { ... }  // si querés pasarle datos
          },
          {
            version: (import.meta.env.DEV ? "dev-" : "prod-") + Date.now(), // cache bust
            // jsUrl / cssUrl si querés overridear rutas
          }
        );

        if (!alive) return;
        console.log("[KpiView] widget mounted, version =", version);
      } catch (e) {
        console.error("[KpiView] mount FAIL", e);
      }
    })();

    return () => {
      alive = false;
      try { unmountKpi(); } catch {}
    };
  }, []);

  return (
    <div className="min-h-[60vh]">
      <div
        ref={ref}
        style={{
          minHeight: 480,
          background: "white",
          borderRadius: 12,
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          overflow: "hidden",
        }}
      />
    </div>
  );
}
