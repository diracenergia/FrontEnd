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
function preferFresh(ws: ConnStatus | undefined, derived: ConnStatus): ConnStatus {
  if (!ws || !Number.isFinite(ws.ageSec)) return derived;
  return ws.ageSec <= derived.ageSec ? ws : derived;
}

// ========== Tipos para agrupación ==========
type AssetLocLink = {
  asset_type: "tank" | "pump" | "valve" | "manifold";
  asset_id: number;
  location_id: number;
  code?: string | null;
  name?: string | null;
};

type GroupItem =
  | { kind: "tank"; obj: any }
  | { kind: "pump"; obj: any };

type Group = {
  key: string;               // "loc:<id>" o "none"
  locId: number | null;
  groupName: string;         // nombre de localidad o "Sin localidad"
  groupCode?: string | null; // código localidad opcional
  items: GroupItem[];
  tanks: number;
  pumps: number;
};

// ========== Estilo profesional por grupo ==========
// hash determinístico
function hashStr(s: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** Colores fijos “enterprise”: franja negra y pill sutil */
function accentForGroup(_key: string) {
  // negro sobrio (Tailwind slate-900 aprox.)
  const stripe = "rgba(198, 198, 199, 1)";        // franja izquierda sólida
  const pillBg = "rgba(15,23,42,0.06)";  // fondo del chip (muy sutil)
  const pillBd = "rgba(15,23,42,0.18)";  // borde del chip
  const pillTx = "rgb(15,23,42)";        // texto del chip
  return { stripe, pillBg, pillBd, pillTx };
}


// Extrae location_id si viene embebido en el asset (varios shapes tolerados)
function getLocIdFromAsset(a: any): number | null {
  const cands = [
    a?.location_id, a?.locationId, a?.loc_id, a?.locId,
    a?.location?.id, a?.loc?.id,
  ];
  for (const v of cands) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export function OverviewGrid({
  plant,
  onOpenTank,
  onOpenPump,
  badKeys = new Set<string>(),
  warnKeys = new Set<string>(),
  statusByKey,
  assetLocs,               // mapeo asset->location
  debug = false,           // logs de agrupación
}: {
  plant: any;
  onOpenTank: (id: string | number) => void;
  onOpenPump: (id: string | number) => void;
  badKeys?: Set<string>;
  warnKeys?: Set<string>;
  statusByKey?: Record<string, ConnStatus>;
  assetLocs?: AssetLocLink[];
  debug?: boolean;
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

  // ====== Mapa de links asset -> location_id + metadatos de localidad ======
  const linkMap = React.useMemo(() => {
    const map = new Map<string, { locId: number; code?: string | null; name?: string | null }>();
    (assetLocs ?? []).forEach((l) => {
      const key = `${l.asset_type}:${l.asset_id}`;
      map.set(key, { locId: l.location_id, code: l.code ?? null, name: l.name ?? null });
    });
    return map;
  }, [assetLocs]);

  // ====== Construcción de grupos por localidad (mezclando tanques y bombas) ======
  const groups = React.useMemo(() => {
    const out = new Map<string, Group>();
    const ensureGroup = (locId: number | null, name?: string | null, code?: string | null): Group => {
      const key = locId != null ? `loc:${locId}` : "none";
      let g = out.get(key);
      if (!g) {
        const groupName = name ?? "Sin localidad";
        g = {
          key,
          locId,
          groupName,
          groupCode: code ?? undefined,
          items: [],
          tanks: 0,
          pumps: 0,
        };
        out.set(key, g);
      } else {
        // si viene mejor nombre/código más adelante, lo completamos
        if (!g.groupCode && code) g.groupCode = code;
        if (g.groupName === "Sin localidad" && name) g.groupName = name;
      }
      return g;
    };

    // Tanques
    (plant?.tanks ?? []).forEach((t: any) => {
      const nid = t.tankId ?? t.id;
      const fromAsset = getLocIdFromAsset(t);
      const link = linkMap.get(`tank:${nid}`);
      const chosen = fromAsset != null ? fromAsset : (link ? link.locId : null);
      const g = ensureGroup(chosen, link?.name ?? undefined, link?.code ?? undefined);
      g.items.push({ kind: "tank", obj: t });
      g.tanks += 1;
      if (debug) {
        // eslint-disable-next-line no-console
        console.groupCollapsed("[OV] tank #", nid);
        console.log({ idFromAsset: fromAsset, idFromLink: link?.locId ?? null, chosenId: chosen, groupName: g.groupName, groupCode: g.groupCode });
        console.groupEnd();
      }
    });

    // Bombas
    (plant?.pumps ?? []).forEach((p: any) => {
      const nid = p.pumpId ?? p.id;
      const fromAsset = getLocIdFromAsset(p);
      const link = linkMap.get(`pump:${nid}`);
      const chosen = fromAsset != null ? fromAsset : (link ? link.locId : null);
      const g = ensureGroup(chosen, link?.name ?? undefined, link?.code ?? undefined);
      g.items.push({ kind: "pump", obj: p });
      g.pumps += 1;
      if (debug) {
        // eslint-disable-next-line no-console
        console.groupCollapsed("[OV] pump #", nid);
        console.log({ idFromAsset: fromAsset, idFromLink: link?.locId ?? null, chosenId: chosen, groupName: g.groupName, groupCode: g.groupCode });
        console.groupEnd();
      }
    });

    // Si no trajimos linkMap y nada tiene loc → quedará un solo grupo "none"
    const list = Array.from(out.values());
    // ordenar: con localidad primero (por nombre), y “Sin localidad” al final
    list.sort((a, b) => {
      const an = a.locId == null;
      const bn = b.locId == null;
      if (an !== bn) return an ? 1 : -1;
      return a.groupName.localeCompare(b.groupName, "es", { sensitivity: "base" });
    });

    if (debug) {
      const table = list.map(g => ({
        locId: g.locId,
        name: g.groupName,
        code: g.groupCode,
        tanks: g.tanks,
        pumps: g.pumps,
      }));
      // eslint-disable-next-line no-console
      console.log("%c[OV] grupos por localidad", "color:#2563eb;font-weight:600");
      // eslint-disable-next-line no-console
      console.table(table);
      if (!assetLocs || !assetLocs.length) {
        // eslint-disable-next-line no-console
        console.warn("[OV] linkMap vacío: no se pasó assetLocs; dependeremos del location_id embebido en cada asset.");
      }
    }

    return list;
  }, [plant?.tanks, plant?.pumps, linkMap, debug, assetLocs]);

  const renderItemCard = (it: GroupItem) => {
    if (it.kind === "tank") {
      const t = it.obj;
      return (
        <TankCard
          key={`T-${t.id}`}
          tank={t}
          onClick={() => onOpenTank(t.id)}
          {...tankCardProps(t)}
        />
      );
    }
    const p = it.obj;
    return (
      <PumpCard
        key={`P-${p.id}`}
        pump={p}
        onClick={() => onOpenPump(p.id)}
        {...pumpCardProps(p)}
      />
    );
  };

  return (
    <div className="space-y-6">
      {/* KPIs globales */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <SummaryCard title="Tanques" value={plant?.tanks?.length ?? 0} />
        <SummaryCard title="Bombas" value={plant?.pumps?.length ?? 0} />
        <SummaryCard title="Alarmas activas" value={plant?.alarms?.length ?? 0} />
      </div>

      {/* Grupos por localidad, mezclando tanques y bombas */}
      <section className="space-y-4">
        {groups.map((g) => {
          const acc = accentForGroup(g.key);
          return (
            <div
              key={g.key}
              className="rounded-2xl border border-slate-200 bg-white shadow-sm p-3 sm:p-4"
              style={{ borderLeft: `6px solid ${acc.stripe}` }}
            >
              {/* Cabecera del grupo */}
              <div className="mb-3 pb-2 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="text-sm font-semibold px-2.5 py-1 rounded-full"
                    style={{
                      backgroundColor: acc.pillBg,
                      border: `1px solid ${acc.pillBd}`,
                      color: acc.pillTx,
                    }}
                  >
                    {g.groupName}
                  </span>
                  {g.groupCode ? (
                    <span className="text-xs text-slate-500">({g.groupCode})</span>
                  ) : null}
                </div>
                <div className="text-xs text-slate-600 flex items-center gap-2">
                  <span className="rounded-md bg-slate-50 border border-slate-200 px-2 py-0.5">
                    Tanques: <b>{g.tanks}</b>
                  </span>
                  <span className="rounded-md bg-slate-50 border border-slate-200 px-2 py-0.5">
                    Bombas: <b>{g.pumps}</b>
                  </span>
                </div>
              </div>

              {/* Grid de assets mezclados */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {g.items.map(renderItemCard)}
              </div>
            </div>
          );
        })}

        {/* Por si no hay datos aún */}
        {(!groups || groups.length === 0) && (
          <div className="text-sm text-slate-500">Sin activos para mostrar.</div>
        )}
      </section>
    </div>
  );
}
