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

const DEFAULT_THRESHOLDS = { lowCritical: 10, lowWarning: 25, highWarning: 80, highCritical: 90 };

// Umbrales de “online” por latencia del último heartbeat del dispositivo
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

export default function ScadaApp({ initialUser }: { initialUser?: User }) {
  // Drawer para faceplates
  const [drawer, setDrawer] = React.useState<{ type: "tank" | "pump" | null; id?: string | number | null }>({ type: null });

  // Usuario mínimo (solo para mostrar y permisos básicos si hiciera falta)
  const [user] = React.useState<User>(initialUser || { id: "u1", name: "operador@rdls", role: "operador" });

  // Datos principales de Operaciones
  const POLL_MS = Number((import.meta as any).env?.VITE_POLL_MS ?? 5000);
  const { plant, setPlant, loading, err, kpis } = usePlant(POLL_MS);

  // Beats por dispositivo (para estado online/offline)
  const [beats, setBeats] = React.useState<Record<string, number>>({}); // device_id -> lastBeatMs

  // Mapeo de activos a localidades (Overview agrupado)
  const [assetLocs, setAssetLocs] = React.useState<AssetLocLink[] | null>(null);

  // Carga de mapeo localidades -> activos
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const locs = await infra2.locations();
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
        if (!cancelled) setAssetLocs(all);
      } catch (e) {
        console.error("[ScadaApp] assetLocs FAIL", e);
        if (!cancelled) setAssetLocs([]); // evita null para que OverviewGrid no espere
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Helpers
  const get = (m: any, k: string) => (m?.[k] !== undefined ? m[k] : m?.payload?.[k]);
  const nowMs = () => Date.now();

  // Conexión WS + handlers (tanques/bombas [+ alarmas en estado, pero sin UI de alarmas])
  React.useEffect(() => {
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

        // (Mantenemos actualización de alarmas en el estado de planta por si Overview/KPIs lo usan,
        //  pero sin páginas ni navegación de alarmas)
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
      off();
    };
  }, [setPlant]);

  // Resumen de online/offline por activo (para Overview y badge en faceplate)
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

  // Cuerpo de Operaciones (único)
  const body = (
    <OverviewGrid
      plant={plant}
      assetLocs={assetLocs ?? undefined}
      onOpenTank={(id) => setDrawer({ type: "tank", id })}
      onOpenPump={(id) => setDrawer({ type: "pump", id })}
      statusByKey={statusByKey}
      debug
    />
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="flex">
        {/* Sidebar con UNA sola entrada: Operaciones */}
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
              <NavItem label="Operaciones" active onClick={() => { /* único ítem */ }} />
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
                <div className="text-lg font-semibold tracking-tight">Operaciones</div>
                {/* KPIs globales (sin “Alarmas activas”) */}
                <div className="hidden md:flex items-center gap-3 text-xs">
                  <KpiPill label="Nivel promedio" value={loading && !plant.tanks.length ? "…" : `${kpis.avg}%`} tone="ok" />
                  <KpiPill label="Críticos" value={loading && !plant.tanks.length ? "…" : `${kpis.crit}`} tone={kpis.crit ? "bad" : "ok"} />
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

      {/* Drawer de faceplates (tanque/bomba) */}
      {(() => {
        const isTank = drawer.type === "tank";
        const t = isTank ? plant.tanks.find((x: any) => String(x.id) === String(drawer.id)) : null;
        const p = drawer.type === "pump" ? plant.pumps.find((x: any) => String(x.id) === String(drawer.id)) : null;

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
            {drawer.type === "pump" && p && <PumpFaceplate pump={p} user={user} onAudit={(evt: any) => console.log("[AUDIT]", evt)} />}
          </Drawer>
        );
      })()}
    </div>
  );
}
