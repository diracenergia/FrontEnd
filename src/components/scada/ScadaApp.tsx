// src/components/scada/ScadaApp.tsx
import React from "react";
import type { User } from "./types";
import { Drawer, NavItem, KpiPill, Badge } from "./ui";
import { OverviewGrid, AlarmsPage, TrendsPage, SettingsPage, AuditPage } from "./pages";
import InfraestructuraPage from "./pages/InfraestructuraPage";
import { useLocation } from "react-router-dom";
import { hasPerm } from "./rbac";
import { labelOfTab, sevMeta, severityOf } from "./utils";
import { usePlant } from "./hooks/usePlant";
import { useAudit } from "./hooks/useAudit";
import { TankFaceplate } from "./faceplates/TankFaceplate";
import { PumpFaceplate } from "./faceplates/PumpFaceplate";

// 🔌 WS (telemetría en tiempo real)
import { connectTelemetryWS, onWS } from "../../lib/ws";
// 🔔 REST para alarmas (fallback si no llegan por WS)
import { api, infra2 } from "../../lib/api";

const DEFAULT_THRESHOLDS = { lowCritical: 10, lowWarning: 25, highWarning: 80, highCritical: 90 };

// Umbrales de “online” por latencia del último heartbeat del dispositivo
const ONLINE_WARN_SEC = Number((import.meta as any).env?.VITE_WS_WARN_SEC ?? 30);
const ONLINE_CRIT_SEC = Number((import.meta as any).env?.VITE_WS_CRIT_SEC ?? 120);

// Poll de alarmas (0 = deshabilitado)
const ALARMS_POLL_MS = Number((import.meta as any).env?.VITE_ALARMS_POLL_MS ?? 5000);

// === Tipos locales para mapeo de localidades (lo que espera OverviewGrid) ===
type AssetLocLink = {
  asset_type: "tank" | "pump";
  asset_id: number;
  location_id: number;
  code?: string | null;
  name?: string | null;
};

export default function ScadaApp({ initialUser }: { initialUser?: User }) {
  const location = useLocation();

  const [tab, setTab] = React.useState<"overview" | "alarms" | "trends" | "settings" | "audit" | "infra">("overview");
  const [drawer, setDrawer] = React.useState<{ type: "tank" | "pump" | null; id?: string | number | null }>({ type: null });
  const [user] = React.useState<User>(initialUser || { id: "u1", name: "operador@rdls", role: "operador" });

  // Podés bajar el polling a 0 si querés depender 100% del WS: VITE_POLL_MS=0
  const POLL_MS = Number((import.meta as any).env?.VITE_POLL_MS ?? 5000);
  const { plant, setPlant, loading, err, kpis } = usePlant(POLL_MS);
  const { rows: auditRows } = useAudit(15000);

  const logAction = (evt: any) => console.log("[AUDIT]", evt); // stub seguro

  // ===== Per-device beats (WS) → online/offline por activo =====
  const [beats, setBeats] = React.useState<Record<string, number>>({}); // device_id -> lastBeatMs

  // === NUEVO: mapeo de localidades para agrupar el Overview ===
  const [assetLocs, setAssetLocs] = React.useState<AssetLocLink[] | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Usamos la API tipada del proyecto (usa VITE_API_URL, API key y X-Org-Id)
        const locs = await infra2.locations();
        // Si querés paralelizar:
        // const allByLoc = await Promise.all(locs.map(l => infra2.locAssets(l.id).then(gs => ({ loc: l, groups: gs }))));
        // const all: AssetLocLink[] = allByLoc.flatMap(({loc, groups}) => groups.flatMap(g =>
        //   (g.type === "tank" || g.type === "pump") ? g.items.map(it => ({
        //     asset_type: g.type, asset_id: it.id, location_id: loc.id, code: loc.code, name: loc.name
        //   })) : []
        // ));
        // setAssetLocs(all);

        const all: AssetLocLink[] = [];
        for (const loc of locs) {
          const groups = await infra2.locAssets(loc.id);
          for (const g of groups) {
            if (g.type !== "tank" && g.type !== "pump") continue;
            for (const it of g.items) {
              all.push({
                asset_type: g.type as "tank" | "pump",
                asset_id: it.id as number,
                location_id: loc.id,
                code: loc.code,
                name: loc.name,
              });
            }
          }
        }
        if (cancelled) return;
        console.log("[ScadaApp] assetLocs OK", { locs: locs.length, links: all.length, sample: all.slice(0, 8) });
        setAssetLocs(all);
      } catch (e) {
        console.error("[ScadaApp] assetLocs FAIL", e);
        if (!cancelled) setAssetLocs([]); // evita null para que OverviewGrid no espere
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 🔎 LOG: cada render (ruta + tab)
  console.log("[ScadaApp] render", {
    pathname: location.pathname,
    tab,
    loading,
    err: !!err,
    tanks: plant?.tanks?.length ?? 0,
    pumps: plant?.pumps?.length ?? 0,
  });

  // 🔎 LOG: cambios de tab
  React.useEffect(() => {
    console.log("[ScadaApp] tab ->", tab);
  }, [tab]);

  // 🔎 LOG: cambios grandes del plant (solo resumen)
  React.useEffect(() => {
    console.log("[ScadaApp] plant update", {
      tanks: plant?.tanks?.length ?? 0,
      pumps: plant?.pumps?.length ?? 0,
      alarms: plant?.alarms?.length ?? 0,
    });
  }, [plant?.tanks, plant?.pumps, plant?.alarms]);

  // 🔎 LOG: cambios del drawer
  React.useEffect(() => {
    console.log("[ScadaApp] drawer ->", drawer);
  }, [drawer]);

  // Helpers para tolerar distintos shapes en los mensajes del backend
  const get = (m: any, k: string) => (m?.[k] !== undefined ? m[k] : m?.payload?.[k]);
  const nowMs = () => Date.now();

  React.useEffect(() => {
    console.log("[WS] connectTelemetryWS()");
    connectTelemetryWS();

    const off = onWS((m: any) => {
      const type = m?.type;

      const devId = get(m, "device_id");
      if (devId) {
        setBeats((prev) => ({ ...prev, [String(devId)]: nowMs() }));
      }

      switch (type) {
        case "status":
        case "heartbeat":
          break;

        case "tank_update": {
          const tkId = get(m, "tank_id") ?? get(m, "id");
          const latest = get(m, "latest") ?? m; // admite plano
          if (typeof tkId !== "number" || !latest) return;

          const logicalDev = `rdls-esp32-tk${tkId}`;
          setBeats((prev) => ({ ...prev, [logicalDev]: nowMs() }));

          setPlant((prev: any) => {
            const next = { ...prev, tanks: [...(prev.tanks || [])] };
            const idx = next.tanks.findIndex((t: any) => (t.tankId ?? t.id) === tkId);
            if (idx >= 0) {
              const t = next.tanks[idx];
              const levelPct =
                typeof latest.level_percent === "number" ? latest.level_percent : t.levelPct;
              const capacityL = typeof t.capacityL === "number" ? t.capacityL : null;
              const volumeL =
                latest.volume_l != null
                  ? latest.volume_l
                  : capacityL != null && typeof levelPct === "number"
                  ? Math.round((capacityL * levelPct) / 100)
                  : t.volumeL;

              next.tanks[idx] = {
                ...t,
                latest,
                levelPct,
                volumeL,
                temperatureC: latest?.temperature_c ?? t.temperatureC,
              };
            }
            return next;
          });
          break;
        }

        case "pump_update": {
          const puId = get(m, "pump_id") ?? get(m, "id");
          const latest = get(m, "latest") ?? m;
          if (typeof puId !== "number" || !latest) return;

          const logicalDev = `rdls-esp32-pu${puId}`;
          setBeats((prev) => ({ ...prev, [logicalDev]: nowMs() }));

          setPlant((prev: any) => {
            const next = { ...prev, pumps: [...(prev.pumps || [])] };
            const idx = next.pumps.findIndex((p: any) => (p.pumpId ?? p.id) === puId);
            if (idx >= 0) {
              const p = next.pumps[idx];
              next.pumps[idx] = {
                ...p,
                latest,
                state: latest?.is_on ? "run" : "stop",
              };
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

    return () => {
      console.log("[WS] off()");
      off();
    };
  }, [setPlant]);

  // 🔎 LOG: beats resumen
  React.useEffect(() => {
    const keys = Object.keys(beats);
    if (keys.length) {
      const sample = keys.slice(0, 3).map((k) => `${k}:${beats[k]}`);
      console.log("[WS] beats update", { count: keys.length, sample });
    }
  }, [beats]);

  // Mapa por activo (TK-xx/PU-yy) con estado online/warn/offline según edad del último beat
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
      const dev = `rdls-esp32-tk${numericId}`;
      out[`TK-${numericId}`] = statusOf(dev);
    });

    (plant.pumps || []).forEach((p: any) => {
      const numericId = p.pumpId ?? p.id;
      const dev = `rdls-esp32-pu${numericId}`;
      out[`PU-${numericId}`] = statusOf(dev);
    });

    return out;
  }, [plant, beats]);

  const body =
    tab === "overview" ? (
      <OverviewGrid
        plant={plant}
        assetLocs={assetLocs ?? undefined}     // ← mapeo para agrupar por localidad
        onOpenTank={(id) => setDrawer({ type: "tank", id })}
        onOpenPump={(id) => setDrawer({ type: "pump", id })}
        statusByKey={statusByKey}
        debug                                   // logs detallados en consola
      />
    ) : tab === "alarms" ? (
      <AlarmsPage plant={plant} setPlant={setPlant} user={user} onAudit={(evt: any) => logAction(evt)} />
    ) : tab === "trends" ? (
      <TrendsPage />
    ) : tab === "settings" ? (
      <SettingsPage
        plant={plant}
        setPlant={(updater: any) => {
          setPlant((prev: any) => {
            const next = typeof updater === "function" ? updater(prev) : updater;
            (prev.tanks || []).forEach((t: any, i: number) => {
              const n = (next.tanks || [])[i];
              if (!n) return;
              if (JSON.stringify(t.thresholds) !== JSON.stringify(n.thresholds)) {
                const permitted = hasPerm(user, "canEditSetpoints");
                logAction({
                  action: "EDIT_THRESHOLD",
                  asset: t.id,
                  details: JSON.stringify(n.thresholds),
                  result: permitted ? "ok" : "denied",
                });
              }
            });
            return next;
          });
        }}
        user={user}
      />
    ) : tab === "audit" ? (
      <AuditPage audit={auditRows} />
    ) : (
      <InfraestructuraPage />
    );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="flex">
        <aside className="hidden md:flex md:flex-col md:w-64 bg-white border-r border-slate-200 min-h-screen p-4 justify-between">
          <div>
            <div className="flex items-center gap-2 mb-6">
              <img src="/img/logodirac.jpeg" alt="Logo DIRAC" className="h-8 w-8 rounded-lg object-cover" />
              <div>
                <div className="text-sm text-slate-500">INTRUMENTACION</div>
                <div className="font-semibold">DIRAC</div>
              </div>
            </div>

            <nav className="space-y-1">
              
              <NavItem label="Infraestructura" active={tab === "infra"} onClick={() => setTab("infra")} />
              <NavItem label="Overview" active={tab === "overview"} onClick={() => setTab("overview")} />
              <NavItem label="Alarmas" active={tab === "alarms"} onClick={() => setTab("alarms")} />
              <NavItem label="Tendencias" active={tab === "trends"} onClick={() => setTab("trends")} />
              <NavItem label="Configuración" active={tab === "settings"} onClick={() => setTab("settings")} />
              <NavItem label="Auditoría" active={tab === "audit"} onClick={() => setTab("audit")} />
              
            </nav>
          </div>

          <div className="text-xs text-slate-500">
            <div>Usuario: {user.name}</div>
            <div>Rol: {user.role}</div>
            <div>Empresa: {user.company?.name ?? "—"}</div>
          </div>
        </aside>

        <main className="flex-1 min-h-screen">
          <header className="sticky top-0 z-10 bg-white border-b border-slate-200">
            <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-lg font-semibold tracking-tight">{labelOfTab(tab)}</div>
                {/* KPIs globales */}
                <div className="hidden md:flex items-center gap-3 text-xs">
                  <KpiPill label="Nivel promedio" value={loading && !plant.tanks.length ? "…" : `${kpis.avg}%`} tone="ok" />
                  <KpiPill label="Críticos" value={loading && !plant.tanks.length ? "…" : `${kpis.crit}`} tone={kpis.crit ? "bad" : "ok"} />
                  <KpiPill label="Alarmas activas" value={`${kpis.alarmsAct}`} tone={kpis.alarmsAct ? "warn" : "ok"} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 rounded-lg bg-slate-100 text-xs">{user.company?.name ?? "—"}</span>
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
            {loading && !plant.tanks.length ? (
              <div className="p-4">Cargando…</div>
            ) : err ? (
              <div className="p-4 text-red-600">Error: {String(err)}</div>
            ) : (
              body
            )}
          </div>
        </main>
      </div>

      {/* Drawer */}
      {(() => {
        const isTank = drawer.type === "tank";
        const t = isTank ? plant.tanks.find((x: any) => String(x.id) === String(drawer.id)) : null;
        const p = drawer.type === "pump" ? plant.pumps.find((x: any) => String(x.id) === String(drawer.id)) : null;

        const sev = t ? severityOf(t.levelPct, t.thresholds ?? DEFAULT_THRESHOLDS) : null;
        const meta = sev ? sevMeta(sev) : null;

        return (
          <Drawer
            open={!!drawer.type}
            onClose={() => {
              console.log("[Drawer] close");
              setDrawer({ type: null });
            }}
            title={isTank ? t?.name : drawer.type === "pump" ? p?.name : "Faceplate"}
            right={isTank && meta ? <Badge tone={meta.tone}>{meta.label}</Badge> : null}
          >
            {isTank && t && <TankFaceplate tank={t} headerless />}
            {drawer.type === "pump" && p && <PumpFaceplate pump={p} user={user} onAudit={(evt: any) => console.log("[AUDIT]", evt)} />}
          </Drawer>
        );
      })()}
    </div>
  );
}
