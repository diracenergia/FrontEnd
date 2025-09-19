import type { KpiPayload } from "@/components/kpi/types";

export async function fetchKpi(baseUrl: string, locId: number, window: "24h"|"7d"|"30d" = "7d"): Promise<KpiPayload> {
  const url = `${baseUrl.replace(/\/+$/,"")}/kpi/overview?loc_id=${locId}&window=${window}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetchKpi failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as KpiPayload;
}
