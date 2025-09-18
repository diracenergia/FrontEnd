// src/components/scada/pages/KpiView.tsx
import React from "react";

declare global {
  interface Window {
    KpiWidget?: {
      mountKpiWidget?: (el: HTMLElement, props?: any) => () => void;
    };
  }
}

export default function KpiView() {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const unmountRef = React.useRef<null | (() => void)>(null);

  React.useEffect(() => {
    let disposed = false;

    // 1) Shims para bundles UMD que esperan Node/globals
    (window as any).process = (window as any).process || { env: { NODE_ENV: "production" } };
    (window as any).global = (window as any).global || window;

    // 2) Helper para inyectar <link rel="stylesheet"> si no existe
    const ensureCss = (href: string) => {
      const id = `kpi-css-${href}`;
      if (!document.getElementById(id)) {
        const link = document.createElement("link");
        link.id = id;
        link.rel = "stylesheet";
        link.href = href;
        document.head.appendChild(link);
      }
    };

    // 3) Helper para cargar un script solo una vez
    const ensureScript = (src: string) =>
      new Promise<void>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>(`script[data-kpi-src="${src}"]`);
        if (existing) {
          // ya insertado anteriormente; esperamos a que esté disponible
          if (window.KpiWidget?.mountKpiWidget) return resolve();
          existing.addEventListener("load", () => resolve());
          existing.addEventListener("error", (e) => reject(e));
          return;
        }
        const s = document.createElement("script");
        s.async = true;
        s.defer = true;
        s.dataset.kpiSrc = src;
        s.src = src;
        s.onload = () => resolve();
        s.onerror = (e) => reject(e);
        document.body.appendChild(s);
      });

    // 4) Cargar assets y montar
    (async () => {
      try {
        ensureCss("/kpi/style.css");

        await ensureScript("/kpi/kpi-widget.umd.js");

        if (disposed) return;

        if (!window.KpiWidget || typeof window.KpiWidget.mountKpiWidget !== "function") {
          console.error("[KPI] window.KpiWidget no disponible o sin mountKpiWidget");
          return;
        }

        if (ref.current) {
          unmountRef.current = window.KpiWidget.mountKpiWidget(ref.current, {
            title: "KPIs — Planta",
            compact: false,
            // podés pasar props.data si tenés datos reales:
            // data: {...}
          });
        }
      } catch (e) {
        console.error("[KPI] fallo cargando bundle", e);
      }
    })();

    return () => {
      disposed = true;
      if (unmountRef.current) {
        try {
          unmountRef.current();
        } catch {}
      }
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
