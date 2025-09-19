import React, { useEffect, useState } from "react";
import KpiContent from "@/components/kpi/KpiContent";
import type { KpiPayload } from "@/components/kpi/types";
import { fetchKpi } from "@/data/fetchKpi";

type Props = { baseUrl: string; locationId: number; window?: "24h"|"7d"|"30d"; title?: string; };

export default function KpiWidgetFetch({ baseUrl, locationId, window="7d", title }: Props) {
  const [data, setData] = useState<KpiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { fetchKpi(baseUrl, locationId, window).then(setData).catch(e => setError(String(e))); }, [baseUrl, locationId, window]);
  if (error) return <div style={{ color: "crimson" }}>Error: {error}</div>;
  if (!data) return <div>Cargando…</div>;
  return (<div className="kpi-root">{title && <h2 style={{ margin: 0, marginBottom: 12 }}>{title}</h2>}<KpiContent data={data} /></div>);
}
