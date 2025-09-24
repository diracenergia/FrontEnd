// src/components/ByLocationTable.tsx
import React, { useMemo } from "react";
import { k, pct } from "../utils/format";

// Podés ajustar este tipo según tu Dataset real.
// Agregamos active_hours_avg y quitamos alarms/kWh del render.
type Row = {
  location_id: number;
  location_code?: string | null;
  location_name: string;

  // Conteos base por ubicación
  tanks_count?: number | null;
  pumps_count?: number | null;
  valves_count?: number | null;
  manifolds_count?: number | null;

  // Estado de bombas
  pumps_on_now?: number | null;

  // Métricas opcionales para mostrar
  avg_level_pct_30d?: number | null;
  active_hours_avg?: number | null;

  // Campos viejos que podrían venir del backend, los ignoramos en el cálculo:
  assets_total?: number | null;
  // kwh_30d?: number | null; // NO se usa
  // alarms_active?: number | null; // NO se muestra
};

// Helpers: si el backend no trae pumps_count/pumps_on_now, calculamos valores seguros (0 por default).
function computePumpCountsSafe(data?: any) {
  const rows: Row[] = Array.isArray(data?.byLocation) ? (data.byLocation as Row[]) : [];
  const totals = new Map<number, number>();
  const onCounts = new Map<number, number>();

  for (const r of rows) {
    const id = r.location_id;
    const total = (r.pumps_count ?? undefined) != null ? Number(r.pumps_count) : 0;
    const on = (r.pumps_on_now ?? undefined) != null ? Number(r.pumps_on_now) : 0;
    totals.set(id, total);
    onCounts.set(id, on);
  }
  return { totals, onCounts };
}

export function ByLocationTable({ data }: { data?: any }) {
  const rows: Row[] = Array.isArray(data?.byLocation) ? (data!.byLocation as Row[]) : [];
  const { totals, onCounts } = useMemo(() => computePumpCountsSafe(data), [data]);

  const view = useMemo(() => {
    return rows.map((r) => {
      const id = r.location_id;

      // Bombas: priorizamos valores provistos; si no hay, usamos los "seguros"
      const pumpsTotal =
        (r.pumps_count ?? undefined) != null ? Number(r.pumps_count) : (totals.get(id) || 0);
      const pumpsOn =
        (r.pumps_on_now ?? undefined) != null ? Number(r.pumps_on_now) : (onCounts.get(id) || 0);

      // Nivel promedio (como número 0..1 si viene 0..100 lo normalizás antes en backend)
      const avgLevelRaw = r.avg_level_pct_30d;
      const avgLevel =
        typeof avgLevelRaw === "number"
          ? avgLevelRaw
          : avgLevelRaw != null
          ? Number(avgLevelRaw)
          : null;

      // 🔹 Activos = tanques
      const activos = r.tanks_count ?? 0;

      return {
        ...r,
        pumps_total: pumpsTotal,
        pumps_on: pumpsOn,
        avg_level_num: Number.isFinite(avgLevel as number) ? (avgLevel as number) : null,
        assets_total: activos, // usamos este campo para render, pero ahora significa "tanques"
      };
    });
  }, [rows, totals, onCounts]);

  if (!view.length) {
    return (
      <div className="p-4 text-sm text-gray-500 border rounded-2xl">
        No hay datos para mostrar el resumen por ubicación.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-sm text-gray-500">
            <th className="text-left p-3">Ubicación</th>
            <th className="text-right p-3">Activos</th> {/* = tanques */}
            <th className="text-right p-3">Nivel promedio</th>
            <th className="text-right p-3">Bombas (on/total)</th>
            <th className="text-right p-3">hs activas promedio</th>
          </tr>
        </thead>
        <tbody>
          {view.map((r, i) => (
            <tr key={`${r.location_id}-${i}`} className="border-t">
              <td className="p-3">
                <div className="font-medium">{r.location_name}</div>
                {r.location_code ? (
                  <div className="text-xs text-gray-500">{r.location_code}</div>
                ) : null}
              </td>

              {/* Activos (tanques) */}
              <td className="p-3 text-right">{k(r.assets_total ?? 0)}</td>

              {/* Nivel promedio */}
              <td className="p-3 text-right">
                {r.avg_level_num != null ? pct(r.avg_level_num) : "–"}
              </td>

              {/* Bombas on/total */}
              <td className="p-3 text-right">
                {r.pumps_on} / {r.pumps_total}
              </td>

              {/* hs activas promedio */}
              <td className="p-3 text-right">
                {typeof r.active_hours_avg === "number" ? r.active_hours_avg.toFixed(1) : "–"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
