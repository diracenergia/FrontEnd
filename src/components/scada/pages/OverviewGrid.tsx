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

// Helpers para agrupar por localización desde DB
// Si no vienen índices en `plant`, los construimos en el cliente desde arrays crudos
function ensureLocationIndexes(plant: any) {
  const idx: Record<string, string | number> = { ...(plant?.assetLocationsIndex ?? {}) };
  const locsById: Record<string | number, any> = { ...(plant?.locationsById ?? {}) };

  // Armar idx a partir de plant.assetLocations (si existe)
  if (Array.isArray(plant?.assetLocations)) {
    for (const al of plant.assetLocations) {
      if (!al?.asset_type || al?.asset_id == null || al?.location_id == null) continue;
      idx[`${al.asset_type}:${al.asset_id}`] = al.location_id;
    }
  }
  // Armar locsById a partir de plant.locations (si existe)
  if (Array.isArray(plant?.locations)) {
    for (const l of plant.locations) {
      if (!l?.id) continue;
      locsById[l.id] = l;
    }
  }
  return { assetLocationsIndex: idx, locationsById: locsById };
}

function resolveLocation(kind: "tank" | "pump" | "valve" | "manifold", entity: any, plant: any) {
  const { assetLocationsIndex, locationsById } = ensureLocationIndexes(plant);
  const key = `${kind}:${entity?.id ?? entity?.tankId ?? entity?.pumpId}`;
  const locIdFromIdx = assetLocationsIndex?.[key];
  if (locIdFromIdx != null) {
    const locObj = locationsById?.[locIdFromIdx];
    if (locObj) return { id: String(locObj.id), name: String(locObj.name), code: String(locObj.code ?? locObj.name) };
    return { id: String(locIdFromIdx), name: String(locIdFromIdx), code: String(locIdFromIdx) };
  }
  // Fallback a campos embebidos
  const l = entity?.location ?? entity?.loc ?? entity?.site ?? entity?.area ?? {};
  const id = l.id ?? l._id ?? entity?.locationId ?? entity?.locId ?? entity?.siteId ?? entity?.areaId ?? entity?.zone;
  const name = l.name ?? l.title ?? entity?.locationName ?? entity?.zone ?? id ?? "desconocida";
  return { id: String(id ?? "desconocida"), name: String(name), code: String(l.code ?? name) };
}

export function OverviewGrid(({({
  plant,
  onOpenTank,
  onOpenPump,
  badKeys = new Set<string>(),
  warnKeys = new Set<string>(),
  statusByKey,
  // NUEVO: control de acceso por rol y filtro por localización
  currentUserRole = "viewer",
  allowedLocationIds,
}: {
  plant: any;
  onOpenTank: (id: string | number) => void;
  onOpenPump: (id: string | number) => void;
  badKeys?: Set<string>;
  warnKeys?: Set<string>;
  statusByKey?: Record<string, ConnStatus>;
  currentUserRole?: "operator" | "supervisor" | "admin" | "viewer";
  /** Si el usuario es operador, limitar a estas location_ids (Set o array). */
  allowedLocationIds?: Iterable<string | number>;
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

  // --- NUEVO: Agrupar por localización y mostrar tanque(s) + bomba(s) en cada grupo ---
  type LocGroup = { key: string; name: string; code?: string; tanks: any[]; pumps: any[] };
  const locMap = new Map<string, LocGroup>();

  // Cargar tanques en grupos usando índice de DB si está disponible
  (plant?.tanks ?? []).forEach((t: any) => {
    const loc = resolveLocation("tank", t, plant);
    const g = locMap.get(loc.id) ?? { key: loc.id, name: loc.name, code: loc.code, tanks: [], pumps: [] };
    g.tanks.push(t);
    locMap.set(loc.id, g);
  });
  // Cargar bombas en grupos
  (plant?.pumps ?? []).forEach((p: any) => {
    const loc = resolveLocation("pump", p, plant);
    const g = locMap.get(loc.id) ?? { key: loc.id, name: loc.name, code: loc.code, tanks: [], pumps: [] };
    g.pumps.push(p);
    locMap.set(loc.id, g);
  });

  // Ordenar por nombre de localización para consistencia visual
  let groups = Array.from(locMap.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  // --- Filtro por permisos: operadores solo ven sus localizaciones asignadas ---
  if (currentUserRole === "operator" && allowedLocationIds) {
    const allow = new Set(Array.from(allowedLocationIds, (x) => String(x)));
    groups = groups.filter((g) => allow.has(String(g.key)));
  }((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  return (
    <div className="space-y-6">
      {/* Resumen superior (igual que antes) */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <SummaryCard title="Tanques" value={plant?.tanks?.length ?? 0} />
        <SummaryCard title="Bombas" value={plant?.pumps?.length ?? 0} />
        <SummaryCard title="Alarmas activas" value={plant?.alarms?.length ?? 0} />
      </div>

      {/* Vista agrupada por localización */}
      <section>
        <h2 className="text-sm font-medium text-slate-500 mb-2">Por localización</h2>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
          {groups.map((g) => (
            <div key={g.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-slate-800 truncate" title={g.name}>
                {g.code ? `${g.code} · ${g.name}` : g.name}
              </h3>
                <span className="text-xs text-slate-500 whitespace-nowrap">{g.tanks.length} tanq · {g.pumps.length} bombas</span>
              </div>

              {/* Grid interno que mezcla tanques y bombas con el mismo look que Overview */}
              <div className="grid sm:grid-cols-2 gap-3">
                {g.tanks.map((t) => (
                  <TankCard
                    key={`TK-${t.id}`}
                    tank={t}
                    onClick={() => onOpenTank(t.id)}
                    {...tankCardProps(t)}
                  />
                ))}
                {g.pumps.map((p) => (
                  <PumpCard
                    key={`PU-${p.id}`}
                    pump={p}
                    onClick={() => onOpenPump(p.id)}
                    {...pumpCardProps(p)}
                  />
                ))}
              </div>

              {/* Si una localización no tiene ni tanque ni bomba, mostramos un estado vacío suave */}
              {g.tanks.length === 0 && g.pumps.length === 0 && (
                <div className="text-sm text-slate-500">Sin equipos asignados.</div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default OverviewGrid;
