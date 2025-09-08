// src/components/scada/ScadaApp.tsx
import React from "react";
import type { User } from "./types";
import { Drawer, NavItem, KpiPill, Badge } from "./ui";
import { OverviewGrid, AlarmsPage, TrendsPage, SettingsPage, AuditPage } from "./pages";
import { hasPerm } from "./rbac";
import { labelOfTab, sevMeta, severityOf } from "./utils";
import { usePlant } from "./hooks/usePlant";
import { useAudit } from "./hooks/useAudit";
import { TankFaceplate } from "./faceplates/TankFaceplate";
import { PumpFaceplate } from "./faceplates/PumpFaceplate";

// 🔌 WS (telemetría en tiempo real)
import { connectTelemetryWS, onWS } from "../../lib/ws";
// 🔔 REST para alarmas (fallback si no llegan por WS)
import { api } from "../../lib/api";

const DEFAULT_THRESHOLDS = { lowCritical: 10, lowWarning: 25, highWarning: 80, highCritical: 90 };

// Umbrales de “online” por latencia del último heartbeat del dispositivo
const ONLINE_WARN_SEC = Number((import.meta as any).env?.VITE_WS_WARN_SEC ?? 30);
const ONLINE_CRIT_SEC = Number((import.meta as any).env?.VITE_WS_CRIT_SEC ?? 120);

// Poll de alarmas (0 = deshabilitado)
const ALARMS_POLL_MS = Number((import.meta as any).env?.VITE_ALARMS_POLL_MS ?? 5000);

export default function ScadaApp({ initialUser }: { initialUser?: User }) {
  const [tab, setTab] = React.useState<"overview" | "alarms" | "trends" | "settings" | "audit">("overview");
  const [drawer, setDrawer] = React.useState<{ type: "tank" | "pump" | null; id?: string | null }>({ type: null });
  const [user] = React.useState<User>(initialUser || { id: "u1", name: "operador@rdls", role: "operador" });

  // Podés bajar el polling a 0 si querés depender 100% del WS: VITE_POLL_MS=0
  const POLL_MS = Number((import.meta as any).env?.VITE_POLL_MS ?? 5000);
  const { plant, setPlant, loading, err, kpis } = usePlant(POLL_MS);
  const { rows: auditRows } = useAudit(15000);

  const logAction = (evt: any) => console.log("[AUDIT]", evt); // stub seguro

  // ===== Per-device beats (WS) → online/offline por activo =====
  const [beats, setBeats] = React.useState<Record<string, number>>({}); // device_id -> lastBeatMs

  // Helpers para tolerar distintos shapes en los mensajes del backend
  const get = (m: any, k: string) => (m?.[k] !== undefined ? m[k] : m?.payload?.[k]);
  const nowMs = () => Date.now();

  React.useEffect(() => {
    // 1) Conectar (idempotente)
    connectTelemetryWS();

    // 2) Suscripción a eventos
    const off = onWS((m: any) => {
      const type = m?.type;

      // Si el mensaje tiene device_id, registramos beat SOLO de ese dispositivo
      const devId = get(m, "device_id");
      if (devId) {
        setBeats((prev) => ({ ...prev, [String(devId)]: nowMs() }));
      }

      switch (type) {
        case "status":
        case "heartbeat":
          // ya marcamos beat arriba si vino device_id
          break;

        case "tank_update": {
          const tkId = get(m, "tank_id") ?? get(m, "id");
          const latest = get(m, "latest") ?? m; // admite plano
          if (typeof tkId !== "number" || !latest) return;

          // Marca beat por el activo (device lógico) aunque no venga device_id
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

          // Marca beat por el activo (device lógico) aunque no venga device_id
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
          // Si el backend emite alarmas por WS, actualizamos en vivo
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

    return () => off();
  }, [setPlant]);

  // 🔁 Poll de alarmas (fallback REST). Mantiene la tabla viva si WS no emite eventos de alarmas.
  React.useEffect(() => {
    let timer: number | null = null;
    let closed = false;

    const fetchOnce = async () => {
      try {
        const list = await api.listAlarms(true); // activas
        if (!closed) {
          setPlant((prev: any) => ({ ...prev, alarms: Array.isArray(list) ? list : [] }));
        }
      } catch (e) {
        // Silencioso: si falla un tick no interrumpimos UI
        // console.debug("[alarms poll]", e);
      }
    };

    // primer carga
    fetchOnce();

    if (ALARMS_POLL_MS > 0) {
      timer = window.setInterval(fetchOnce, ALARMS_POLL_MS) as unknown as number;
    }
    return () => {
      closed = true;
      if (timer != null) clearInterval(timer as any);
    };
  }, [setPlant]);

  // Mapa por activo (TK-xx/PU-yy) con estado online/warn/offline según edad del último beat
  const statusByKey = React.useMemo(() => {
    const statusOf = (devId: string) => {
      const last = beats[devId];
      if (!last) return { online: false, ageSec: Infinity, tone: "bad" as const };
      const ageSec = Math.round((nowMs() - last) / 1000);
      const tone =
        ageSec < ONLINE_WARN_SEC ? ("ok" as const) :
        ageSec < ONLINE_CRIT_SEC ? ("warn" as const) :
        ("bad" as const);
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
        onOpenTank={(id: string) => setDrawer({ type: "tank", id })}
        onOpenPump={(id: string) => setDrawer({ type: "pump", id })}
        statusByKey={statusByKey}
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
    ) : (
      <AuditPage audit={auditRows} />
    );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="flex">
        <aside className="hidden md:flex md:flex-col md:w-64 bg-white border-r border-slate-200 min-h-screen p-4 justify-between">
          <div>
            <div className="flex items-center gap-2 mb-6">
  <img
  src="/img/logodirac.jpeg"
  alt="Logo DIRAC"
  className="h-8 w-8 rounded-lg object-cover"
/>
  <div>
    <div className="text-sm text-slate-500">INTRUMENTACION</div>
    <div className="font-semibold">DIRAC</div>
  </div>
</div>

            <nav className="space-y-1">
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
                {/* KPIs globales (dejamos como estaban) */}
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
            {/* 👉 sin banners globales de telemetría */}
            {loading && !plant.tanks.length ? (
              <div className="p-4">Cargando…</div>
            ) : err ? (
              <div className="p-4 text-red-600">Error: {err}</div>
            ) : (
              body
            )}
          </div>
        </main>
      </div>

      {/* Drawer */}
      {(() => {
        const isTank = drawer.type === "tank";
        const t = isTank ? plant.tanks.find((x: any) => x.id === drawer.id) : null;
        const p = drawer.type === "pump" ? plant.pumps.find((x: any) => x.id === drawer.id) : null;

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
              <PumpFaceplate pump={p} user={user} onAudit={(evt: any) => console.log("[AUDIT]", evt)} />
            )}
          </Drawer>
        );
      })()}
    </div>
  );
}
