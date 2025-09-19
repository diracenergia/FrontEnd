import React from "react";
import { k, pct } from "../utils";

export default function ByLocationTable({ rows }: { rows: any[] }) {
  return (
    <div className="overflow-auto max-h-80 border rounded-2xl">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            <th className="text-left p-3">Ubicación</th>
            <th className="text-right p-3">Activos</th>
            <th className="text-right p-3">Alarmas</th>
            <th className="text-right p-3">Nivel promedio</th>
            <th className="text-right p-3">Flujo promedio</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.location_id} className="border-t">
              <td className="p-3">
                {r.location_name} <span className="text-gray-400">({r.location_code})</span>
              </td>
              <td className="p-3 text-right">{k(r.assets_total)}</td>
              <td className="p-3 text-right">{k(r.alarms_active)}</td>
              <td className="p-3 text-right">{r.avg_level_pct_30d != null ? pct(r.avg_level_pct_30d) : "–"}</td>
              <td className="p-3 text-right">{r.avg_flow_lpm_30d != null ? `${r.avg_flow_lpm_30d} lpm` : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}