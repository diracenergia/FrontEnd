// src/lib/loadManifest.ts
export type AppItem = { name: string; type: "iframe"; url: string; mount: string };

export async function loadManifest(): Promise<AppItem[]> {
  // lee el manifest del host respetando el BASE_URL del host
  const res = await fetch(new URL("app-manifest.json", import.meta.env.BASE_URL));
  if (!res.ok) throw new Error(`manifest: ${res.status}`);
  const items: AppItem[] = await res.json();

  // en dev, sobreescribimos URLs a los servers locales
  if (import.meta.env.DEV) {
    const KPI_URL   = `http://${import.meta.env.VITE_KPI_HOST ?? "127.0.0.1"}:${import.meta.env.VITE_KPI_PORT ?? 5174}/`;
    const INFRA_URL = `http://${import.meta.env.VITE_INFRA_HOST ?? "127.0.0.1"}:${import.meta.env.VITE_INFRA_PORT ?? 5181}/`;
    for (const it of items) {
      if (it.name === "kpi")   it.url = KPI_URL;
      if (it.name === "infra") it.url = INFRA_URL;
    }
  }
  return items;
}
