import React from "react";
import KpiContent from "@/components/kpi/KpiContent";
import type { KpiPayload } from "@/components/kpi/types";
import { fetchKpi } from "@/data/fetchKpi";

type Props = { baseUrl: string; locationId: number; window?: "24h"|"7d"|"30d"; title?: string; chrome?: "panel"|"none"; };

export default function KpiWidgetFetch({ baseUrl, locationId, window="7d", title, chrome="panel" }: Props) {
  const [data, setData] = React.useState<KpiPayload | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetchKpi(baseUrl, locationId, window).then(setData).catch(e => setErr(String(e)));
  }, [baseUrl, locationId, window]);

  if (err) return <div style={{ color: "crimson" }}>Error: {err}</div>;
  if (!data) return <div>Cargando…</div>;

  return (
    <div className="kpi-root">
      {title && chrome !== "none" && <h2 style={{ margin: 0, marginBottom: 12 }}>{title}</h2>}
      <KpiContent data={data} />
    </div>
  );
}
