export type PresenceItem = {
  node_id: string;                 // debe coincidir con n.id
  online: boolean;
  tone: "ok" | "warn" | "bad";
  age_sec?: number | null;
  last_seen?: string | null;
};

export async function fetchPresenceSimple(apiRoot: string): Promise<PresenceItem[]> {
  const url = `${apiRoot.replace(/\/$/, "")}/conn/simple`;
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
  const j = await r.json();
  return (j.presence ?? []) as PresenceItem[];
}
