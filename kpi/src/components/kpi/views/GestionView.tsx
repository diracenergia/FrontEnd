// src/components/kpi/views/GestionView.tsx
import React from "react";
import KPI from "../shared/KPI";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { criticalResolvedUnder24h, topEnergyByLocation } from "../utils";

type Props = {
  data: any;                 // dataset completo (para topEnergyByLocation)
  byLocation?: any[];        // opcional si querés pasar el filtrado ya hecho
};

export default function GestionView({ data, byLocation }: Props) {
  const { pct, total } = criticalResolvedUnder24h(data.alarms ?? []);
  const top = topEnergyByLocation(data);
  const offlineAssets = 0; // placeholder: conectar luego a fuente real

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <KPI label="Críticas resueltas <24h" value={`${pct.toFixed(0)}%`} sub={`${total} críticas`} />
      <KPI label="Activos fuera de servicio" value={offlineAssets} />
      <KPI label="Ubicaciones (Top energía)" value={top.length} />

      <Card className="rounded-2xl lg:col-span-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-500">Top ubicaciones por consumo (kWh, 30d)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto max-h-60 border rounded-2xl">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left p-3">Ubicación</th>
                  <th className="text-left p-3">Código</th>
                  <th className="text-right p-3">kWh (30d)</th>
                </tr>
              </thead>
              <tbody>
                {top.map((r: any) => (
                  <tr key={r.location_id} className="border-t">
                    <td className="p-3">
                      {
                        (data.locations.find((l: any) => l.location_id === r.location_id) ?? {}).location_name
                      }
                    </td>
                    <td className="p-3">
                      {
                        (data.locations.find((l: any) => l.location_id === r.location_id) ?? {}).location_code
                      }
                    </td>
                    <td className="p-3 text-right">{r.kwh_30d.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}