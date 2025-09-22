// lib/presence.ts
export type PresenceItem = {
  node_id: string;                 // 'pump_10' | 'tank_8'
  online: boolean;
  tone: "ok" | "warn" | "bad";
  age_sec?: number | null;
  last_seen?: string | null;
};

export async function fetchPresenceSimple(apiRoot: string): Promise<PresenceItem[]> {
  const r = await fetch(`${apiRoot}/conn/simple`, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  return (j.presence ?? []) as PresenceItem[];
}
