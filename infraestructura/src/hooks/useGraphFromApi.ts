// src/hooks/useGraphFromApi.ts
export type GraphResponse = { nodes: any[]; edges: string[] };

export async function loadGraphFromApi(infraBase: string, orgId?: string): Promise<GraphResponse> {
  const headers: HeadersInit = orgId ? { "X-Org-Id": String(orgId) } : {};
  const r = await fetch(`${infraBase}/graph`, { headers });
  if (r.ok) return (await r.json()) as GraphResponse;

  // fallback a endpoints separados (mismo header)
  const [nRes, eRes] = await Promise.all([
    fetch(`${infraBase}/graph/nodes`, { headers }),
    fetch(`${infraBase}/graph/edges`, { headers }),
  ]);
  if (!nRes.ok || !eRes.ok) throw new Error(`Fallo /graph y fallback /nodes|/edges`);
  const rawNodes = await nRes.json();
  const rawEdges = await eRes.json();

  const nodes = rawNodes.map((r: any) => {
    const id = r.code ? `${r.type}:${r.code}` : `${r.type}_${r.id ?? r.asset_id}`;
    const o: any = { id, type: r.type, name: r.name };
    if (r.type === "tank")  { o.level = r.level_ratio; o.capacity = r.capacity_liters; }
    if (r.type === "pump")  { o.status = r.pump_status; o.kW = r.rated_kw; }
    if (r.type === "valve") { o.state  = r.valve_state; }
    return o;
  });

  const edges = rawEdges
    .filter((x: any) => x.is_active !== false)
    .map((x: any) => {
      const src = x.from_code ? `${x.from_type}:${x.from_code}` : `${x.from_type}_${x.from_id}`;
      const dst = x.to_code   ? `${x.to_type}:${x.to_code}`     : `${x.to_type}_${x.to_id}`;
      return `${src}>${dst}`;
    });

  return { nodes, edges };
}
