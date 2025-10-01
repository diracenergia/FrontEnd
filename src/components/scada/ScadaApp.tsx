// src/components/scada/ScadaApp.tsx
import React from "react";
import type { User } from "./types";
import { Drawer, NavItem, KpiPill, Badge } from "./ui";
import { OverviewGrid } from "./pages";
import { sevMeta, severityOf } from "./utils";
import { usePlant } from "./hooks/usePlant";
import { TankFaceplate } from "./faceplates/TankFaceplate";
import { PumpFaceplate } from "./faceplates/PumpFaceplate";

// 🔌 WS (telemetría en tiempo real)
import { connectTelemetryWS, onWS } from "../../lib/ws";
// 🔌 REST (infraestructura para mapping de localidades -> activos)
import { infra2 } from "../../lib/api";
// 🔌 Loader de micro-apps (iframe / module)
import { loadApps } from "../../loader";

const DEFAULT_THRESHOLDS = { lowCritical: 10, lowWarning: 25, highWarning: 80, highCritical: 90 };
const ONLINE_WARN_SEC = Number((import.meta as any).env?.VITE_WS_WARN_SEC ?? 30);
const ONLINE_CRIT_SEC = Number((import.meta as any).env?.VITE_WS_CRIT_SEC ?? 120);

// === Tipos locales para mapeo de localidades (lo que espera OverviewGrid) ===
type AssetLocLink = {
  asset_type: "tank" | "pump";
  asset_id: number;
  location_id: number;
  code?: string | null;
  name?: string | null;
};

// Apps del manifest (para tabs dinámicas)
type AppItem = {
  name: string;
  type: "iframe" | "module" | "webcomponent";
  url: string;
  mount: string; // ej. "#kpi-root"
  tag?: string;
};

// Helpers generales
const nowMs = () => Date.now();
const pick = (m: any, k: string) => (m?.[k] !== undefined ? m[k] : m?.payload?.[k]);
const toNum = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

// 🧩 decode JWT local (para extraer org_id)
function decodeJwt(token: string): any {
  try {
    const base64 = token.split(".")[1];
    const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, "=");
    const json = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return {};
  }
}

export default function ScadaApp({ initialUser }: { initialUser?: User }) {
  // -------- Tabs / manifest de micro-apps ----------
  const [activeTab, setActiveTab] = React.useState<"operaciones" | string>("operaciones");
  const [apps, setApps] = React.useState<AppItem[]>([]);

  // Leer manifest una vez
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/apps.manifest.json", { cache: "no-store" });
        const list: AppItem[] = await res.json();
        if (!cancelled) setApps(list);
      } catch (e) {
        console.error("[shell] no pude leer el manifest", e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 👉 Montar micro-apps con CONTEXTO (orgId + apiBase + apiKey)
  React.useEffect(() => {
    if (!apps.length) return;

    // Tomamos org_id del token guardado por el login
    const token = localStorage.getItem("rdls_token") || "";
    const payload = token ? decodeJwt(token) : {};
    const orgFromToken = Number(payload?.org_id) || 0;

    // fallback por query/env si hiciera falta
    const urlOrg = Number(new URLSearchParams(location.search).get("org")) || 0;
    const envOrg = Number((import.meta as any).env?.VITE_ORG_ID) || 0;

    const orgId = orgFromToken || urlOrg || envOrg || 1;

    // API base desde envs (o backend por defecto)
    const apiBase =
      (import.meta.env.VITE_API_URL as string) ||
      (import.meta.env.VITE_API_BASE as string) ||
      "https://backend-v85n.onrender.com";

    const apiKey = (import.meta.env.VITE_API_KEY as string) || undefined;

    const ctx = { orgId, apiBase, apiKey, authInQuery: false };

    // (Opcional) habilitá logs del loader: localStorage.setItem("embed:debug","1")
    console.log("[shell] loadApps ctx →", ctx);

    const id = requestAnimationFrame(() => {
      loadApps("/apps.manifest.json", { ctx }).catch((e) =>
        console.error("[shell] loadApps error", e)
      );
    });
    return () => cancelAnimationFrame(id);
  }, [apps]);

  // -------- Estado y lógica SCADA (Operaciones) ----------
  // Drawer para faceplates
  const [drawer, setDrawer] = React.useState<{ type: "tank" | "pump" | null; id?: string | number | null }>({ type: null });

  // Usuario mínimo (queda igual)
  const [user] = React.useState<User>(
    initialUser || { id: "u1", name: "operador@rdls", role: "operador" }
  );

  // Datos principales
  const POLL_MS = Number((import.meta as any).env?.VITE_POLL_MS ?? 5000);
  const { plant, setPlant, loading, err, kpis } = usePlant(POLL_MS);

  // Beats por dispositivo
  const [beats, setBeats] = React.useState<Record<string, number>>({});

  // Mapeo activos ↔ localidades
  const [assetLocs, setAssetLocs] = React.useState<AssetLocLink[] | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const locs = await infra2.locations();
        const groupsPerLoc = await Promise.all(
          locs.map(async (loc: any) => ({ loc, groups: await infra2.locAssets(loc.id) }))
        );

        const all: AssetLocLink[] = [];
        for (const { loc, groups } of groupsPerLoc) {
          for (const g of groups) {
            if (g.type !== "tank" && g.type !== "pump") continue;
            for (const it of g.items) {
              const idNum = toNum(it.id);
              if (idNum == null) continue;
              all.push({
                asset_type: g.type as "tank" | "pump",
                asset_id: idNum,
                location_id: loc.id,
                code: loc.code,
                name: loc.name,
              });
            }
          }
        }
        if (!cancelled) setAssetLocs(all);
      } catch (e) {
        console.error("[ScadaApp] assetLocs FAIL", e);
        if (!cancelled) setAssetLocs([]); // evita null
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Evitar doble conexión WS en StrictMode
  const wsStartedRef = React.useRef(false);

  React.useEffect(() => {
    if (wsStartedRef.current) return;
    wsStartedRef.current = true;

    connectTelemetryWS();

    const off = onWS((m: any) => {
      const type = m?.type;

      const devId = pick(m, "device_id");
      if (devId) {
        setBeats((prev) => ({ ...prev, [String(devId)]: nowMs() }));
      }

      switch (type) {
        case "status":
        case "heartbeat":
          break;

        case "tank_update": {
          const tkId = pick(m, "tank_id") ?? pick(m, "id");
          const tkNum = toNum(tkId);
          const latest = pick(m, "latest") ?? m; // admite plano
          if (tkNum == null || !latest) return;

          const logicalDev = `rdls-esp32-tk${tkNum}`;
          setBeats((prev) => ({ ...prev, [logicalDev]: nowMs() }));

          setPlant((prev: any) => {
            const next = { ...prev, tanks: [...(prev.tanks || [])] };
            const idx = next.tanks.findIndex((t: any) => (t.tankId ?? t.id) === tkNum);
            if (idx >= 0) {
              const t = next.tanks[idx];
              const levelPct = typeof latest.level_percent === "number" ? latest.level_percent : t.levelPct;
              const capacityL = toNum(t.capacityL);
              const volumeL =
                toNum(latest.volume_l) ??
                (capacityL != null && typeof levelPct === "number"
                  ? Math.round((capacityL * levelPct) / 100)
                  : toNum(t.volumeL));

              next.tanks[idx] = {
                ...t,
                latest,
                levelPct,
                volumeL: volumeL ?? t.volumeL,
                temperatureC: latest?.temperature_c ?? t.temperatureC,
              };
            }
            return next;
          });
          break;
        }

        case "pump_update": {
          const puId = pick(m, "pump_id") ?? pick(m, "id");
          const puNum = toNum(puId);
          const latest = pick(m, "latest") ?? m;
          if (puNum == null || !latest) return;

          const logicalDev = `rdls-esp32-pu${puNum}`;
          setBeats((prev) => ({ ...prev, [logicalDev]: nowMs() }));

          setPlant((prev: any) => {
            const next = { ...prev, pumps: [...(prev.pumps || [])] };
            const idx = next.pumps.findIndex((p: any) => (p.pumpId ?? p.id) === puNum);
            if (idx >= 0) {
              const p = next.pumps[idx];
              next.pumps[idx] = { ...p, latest, state: latest?.is_on ? "run" : "stop" };
            }
            return next;
          });
          break;
        }

        case "alarms_snapshot":
        case "alarms_update": {
          const payload = m?.payload ?? m;
          if (Array.isArray(payload)) {
            setPlant((prev: any) => ({ ...prev, alarms: payload }));
          } else if (payload) {
            setPlant((prev: any) => {
              const list = [...(prev.alarms || [])];
              const idx = list.findIndex((a: any) => a.id === payload.id);
              if (idx >= 0) list[idx] = { ...list[idx], ...payload };
              else list.unshift(payload);
              return { ...prev, alarms: list };
            });
          }
          break;
        }

        default:
          break;
      }
    });

    return () => { off(); };
  }, [setPlant]);

  // Resumen de online/offline por activo
  const statusByKey = React.useMemo(() => {
    const statusOf = (devId: string) => {
      const last = beats[devId];
      if (!last) return { online: false, ageSec: Infinity, tone: "bad" as const };
      const ageSec = Math.round((nowMs() - last) / 1000);
      const tone = ageSec < ONLINE_WARN_SEC ? ("ok" as const) : ageSec < ONLINE_CRIT_SEC ? ("warn" as const) : ("bad" as const);
      return { online: ageSec < ONLINE_CRIT_SEC, ageSec, tone };
    };

    const out: Record<string, { online: boolean; ageSec: number; tone: "ok" | "warn" | "bad" }> = {};

    (plant.tanks || []).forEach((t: any) => {
      const numericId = t.tankId ?? t.id;
      if (numericId == null) return;
      out[`TK-${numericId}`] = statusOf(`rdls-esp32-tk${numericId}`);
    });

    (plant.pumps || []).forEach((p: any) => {
      const numericId = p.pumpId ?? p.id;
      if (numericId == null) return;
      out[`PU-${numericId}`] = statusOf(`rdls-esp32-pu${numericId}`);
    });

    return out;
  }, [plant, beats]);

  // ---------- UI ----------
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="flex">
        {/* Sidebar único (tabs: Operaciones + manifest) */}
        <aside className="hidden md:flex md:flex-col md:w-64 bg-white border-r border-slate-200 min-h-screen p-4 justify-between">
          <div>
            <div className="flex items-center gap-2 mb-6">
              <img src="/img/logodirac.jpeg" alt="Logo DIRAC" className="h-8 w-8 rounded-lg object-cover" />
              <div>
                <div className="text-sm text-slate-500">INSTRUMENTACION</div>
                <div className="font-semibold">DIRAC</div>
              </div>
            </div>

            <nav className="space-y-1">
              <NavItem
                label="Operaciones"
                active={activeTab === "operaciones"}
                onClick={() => setActiveTab("operaciones")}
              />
              {apps.map((a) => (
                <NavItem
                  key={a.name}
                  label={a.name.toUpperCase()}
                  active={activeTab === a.name}
                  onClick={() => setActiveTab(a.name)}
                />
              ))}
            </nav>
          </div>

          <div className="text-xs text-slate-500">
            <div>Usuario: {user.name}</div>
            <div>Rol: {user.role}</div>
            <div>Empresa: {(user as any).company?.name ?? (user as any).company ?? "—"}</div>
          </div>
        </aside>

        <main className="flex-1 min-h-screen">
          <header className="sticky top-0 z-10 bg-white border-b border-slate-200">
            <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-lg font-semibold tracking-tight">
                  {activeTab === "operaciones" ? "Operaciones" : activeTab.toUpperCase()}
                </div>
                {activeTab === "operaciones" && (
                  <div className="hidden md:flex items-center gap-3 text-xs">
                    <KpiPill label="Nivel promedio" value={loading && !plant.tanks?.length ? "…" : `${kpis.avg}%`} tone="ok" />
                    <KpiPill label="Críticos" value={loading && !plant.tanks?.length ? "…" : `${kpis.crit}`} tone={kpis.crit ? "bad" : "ok"} />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 rounded-lg bg-slate-100 text-xs">
                  {(user as any).company?.name ?? (user as any).company ?? "—"}
                </span>
                <button
                  onClick={() => {
                    localStorage.removeItem("rdls_user");
                    window.location.reload();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm"
                >
                  Cerrar sesión
                </button>
              </div>
            </div>
          </header>

          <div className="max-w-7xl mx-auto p-4 md:p-6">
            {/* Tab local */}
            {activeTab === "operaciones"
              ? loading && !plant.tanks?.length
                ? <div className="p-4">Cargando…</div>
                : err
                ? <div className="p-4 text-red-600">Error: {String(err)}</div>
                : (
                  <OverviewGrid
                    plant={plant}
                    assetLocs={assetLocs ?? undefined}
                    onOpenTank={(id) => setDrawer({ type: "tank", id })}
                    onOpenPump={(id) => setDrawer({ type: "pump", id })}
                    statusByKey={statusByKey}
                    debug
                  />
                )
              : null}

            {/* Panes de micro-apps: el loader inyecta el iframe/módulo dentro.
                Mostramos solo el activo. */}
            {apps.map((a) => {
              const id = a.mount.startsWith("#") ? a.mount.slice(1) : a.mount;
              const visible = activeTab === a.name;
              return (
                <section
                  key={a.name}
                  id={id}
                  className="pane"
                  style={{
                    display: visible ? "block" : "none",
                    padding: 0,
                    position: "relative",
                    overflow: "visible",
                    zIndex: 0,
                  }}
                />
              );
            })}
          </div>
        </main>
      </div>

      {/* Drawer de faceplates */}
      {(() => {
        const isTank = drawer.type === "tank";
        const t = isTank
          ? (plant.tanks || []).find((x: any) => String(x.id ?? x.tankId) === String(drawer.id))
          : null;
        const p = drawer.type === "pump"
          ? (plant.pumps || []).find((x: any) => String(x.id ?? x.pumpId) === String(drawer.id))
          : null;

        const sev = t ? severityOf(t.levelPct, t.thresholds ?? DEFAULT_THRESHOLDS) : null;
        const meta = sev ? sevMeta(sev) : null;

        return (
          <Drawer
            open={!!drawer.type}
            onClose={() => setDrawer({ type: null })}
            title={isTank ? t?.name : drawer.type === "pump" ? p?.name : "Faceplate"}
            right={isTank && meta ? <Badge tone={meta.tone}>{meta.label}</Badge> : null}
          >
            {isTank && t && <TankFaceplate tank={t} headerless />}
            {drawer.type === "pump" && p && (
              <PumpFaceplate
                pump={p}
                user={user}
                onAudit={(evt: any) => console.log("[AUDIT]", evt)}
              />
            )}
          </Drawer>
        );
      })()}
    </div>
  );
}
