// src/components/scada/pages/OverviewGrid.tsx
import React from "react";
import { SummaryCard } from "../ui";
import { TankCard, PumpCard } from "../widgets";

export type ConnStatus = { online: boolean; ageSec: number; tone: "ok" | "warn" | "bad" };

const WARN_SEC =
  Number((import.meta as any).env?.VITE_WS_WARN_SEC ?? (import.meta as any).env?.VITE_STALE_WARN_SEC ?? 120);
const CRIT_SEC =
  Number((import.meta as any).env?.VITE_WS_CRIT_SEC ?? (import.meta as any).env?.VITE_STALE_CRIT_SEC ?? 300);

function secSince(ts?: string | null) {
  if (!ts) return Number.POSITIVE_INFINITY;
  const t = new Date(ts).getTime();
  if (!isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.round((Date.now() - t) / 1000));
}
function fallbackFromLatest(ts?: string | null): ConnStatus {
  const ageSec = secSince(ts);
  const tone: ConnStatus["tone"] = ageSec < WARN_SEC ? "ok" : ageSec < CRIT_SEC ? "warn" : "bad";
  return { online: ageSec < CRIT_SEC, ageSec, tone };
}

// Preferimos el estado más fresco (WS vs. última lectura)
function preferFresh(ws: ConnStatus | undefined, derived: ConnStatus): ConnStatus {
  if (!ws || !Number.isFinite(ws.ageSec)) return derived;
  return ws.ageSec <= derived.ageSec ? ws : derived;
}

export function OverviewGrid({
  plant,
  onOpenTank,
  onOpenPump,
  badKeys = new Set<string>(),
  warnKeys = new Set<string>(),
  statusByKey,
}: {
  plant: any;
  onOpenTank: (id: string | number) => void;
  onOpenPump: (id: string | number) => void;
  badKeys?: Set<string>;
  warnKeys?: Set<string>;
  statusByKey?: Record<string, ConnStatus>;
}) {
  const lookupStatus = (prefix: "TK" | "PU", id: string | number): ConnStatus | undefined => {
    const idStr = String(id);
    return statusByKey?.[`${prefix}-${idStr}`] ?? statusByKey?.[idStr];
  };

  const tankCardProps = (t: any) => {
    const nid = t.tankId ?? t.id;
    const ws = lookupStatus("TK", nid);
    const derived = fallbackFromLatest(t?.latest?.ts);
    let status = preferFresh(ws, derived);

    const key = String(nid);
    const tone =
      badKeys.has(key) ? ("bad" as const) :
      warnKeys.has(key) ? ("warn" as const) :
      status.tone;
    status = { ...status, tone };

    return { status };
  };

  const pumpCardProps = (p: any) => {
    const nid = p.pumpId ?? p.id;
    const ws = lookupStatus("PU", nid);
    const derived = fallbackFromLatest(p?.latest?.ts);
    let status = preferFresh(ws, derived);

    const key = String(nid);
    const tone =
      badKeys.has(key) ? ("bad" as const) :
      warnKeys.has(key) ? ("warn" as const) :
      status.tone;
    status = { ...status, tone };

    return { status };
  };

  return (
    <div className="space-y-6">
      {/* Ajustado a 3 tarjetas */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <SummaryCard title="Tanques" value={plant.tanks.length} />
        <SummaryCard title="Bombas" value={plant.pumps.length} />
        <SummaryCard title="Alarmas activas" value={plant.alarms?.length ?? 0} />
      </div>

      <section>
        <h2 className="text-sm font-medium text-slate-500 mb-2">Tanques</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {plant.tanks.map((t: any) => (
            <TankCard
              key={t.id}
              tank={t}
              onClick={() => onOpenTank(t.id)}
              {...tankCardProps(t)}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-slate-500 mb-2">Bombas</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {plant.pumps.map((p: any) => (
            <PumpCard
              key={p.id}
              pump={p}
              onClick={() => onOpenPump(p.id)}
              {...pumpCardProps(p)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
