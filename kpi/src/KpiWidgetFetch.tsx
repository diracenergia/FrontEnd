// kpi/src/KpiWidgetFetch.tsx
// Componente listo para usar que obtiene datos reales del backend (Render)
// y muestra el contenido KPI. Maneja loading, error y re-fetch al cambiar props.

import React, { useEffect, useMemo, useState } from "react";
import type { KpiPayload } from "@/components/kpi/types";
import KpiContent from "@/components/kpi/KpiContent";
import { fetchKpi, type WindowRange } from "@/data/fetchKpi";

type Props = {
  /** URL base del backend. Ej: "https://backend-v85n.onrender.com" */
  baseUrl: string;
  /** ID de la organización (se envía como header X-Org-Id) */
  orgId: number;
  /** ID de la ubicación a consultar */
  locationId: number;
  /** Ventana temporal, default "7d" */
  window?: WindowRange;
  /** Título opcional del widget */
  title?: string;
  /** (Opcional) ID de usuario (header X-User-Id) */
  userId?: number;
  /** Clases/estilos opcionales para contenedor */
  className?: string;
  style?: React.CSSProperties;
};

export default function KpiWidgetFetch({
  baseUrl,
  orgId,
  locationId,
  window = "7d",
  title,
  userId,
  className,
  style,
}: Props) {
  const [data, setData] = useState<KpiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Memo para evitar renders extra por formateo de URL u objetos
  const fetchArgs = useMemo(
    () => ({ baseUrl, orgId, locationId, window, userId }),
    [baseUrl, orgId, locationId, window, userId]
  );

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);

    fetchKpi(
      fetchArgs.baseUrl,
      fetchArgs.locationId,
      fetchArgs.window,
      fetchArgs.orgId,
      fetchArgs.userId,
      { signal: ac.signal, retries: 5, baseDelayMs: 500 }
    )
      .then((payload) => {
        setData(payload);
        setLoading(false);
      })
      .catch((e: any) => {
        if (e?.name === "AbortError") return; // cambio de props: ignorar
        setError(String(e?.message ?? e));
        setLoading(false);
      });

    return () => ac.abort();
  }, [fetchArgs]);

  return (
    <div className={className} style={style}>
      {title ? (
        <h2 style={{ margin: 0, marginBottom: 12 }}>{title}</h2>
      ) : null}

      {loading && !data ? (
        <div style={{ padding: 12, opacity: 0.8 }}>Cargando KPIs…</div>
      ) : error ? (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            border: "1px solid #e2a",
            background: "#fff0f5",
            color: "#a00",
          }}
        >
          Error al cargar KPIs: {error}
        </div>
      ) : data ? (
        <div className="kpi-root">
          <KpiContent data={data} />
        </div>
      ) : (
        <div style={{ padding: 12, opacity: 0.8 }}>Sin datos.</div>
      )}
    </div>
  );
}
