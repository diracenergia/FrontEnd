// src/components/kpi/views/CalidadView.tsx
import React from "react";
import KPI from "../shared/KPI";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { tankStats, tempStats, turnoverEstimatePerDay } from "../utils";

type Props = {
  tankTs?: { level_percent?: number[]; temperature_c?: number[]; timestamps?: string[] };
};

export default function CalidadView({ tankTs }: Props) {
  const stats = tankStats(tankTs);
  const temp = tempStats(tankTs);
  const turnover = turnoverEstimatePerDay(stats.range || 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <KPI label="Nivel medio (24h)" value={stats.mean != null ? `${stats.mean.toFixed(0)}%` : "—"} />
      <KPI
        label="Mín / Máx nivel"
        value={stats.min != null ? `${stats.min.toFixed(0)}% / ${stats.max?.toFixed(0)}%` : "—"}
      />
      <KPI label="Renovación estimada" value={`${turnover.toFixed(0)}%/día`} />

      <Card className="rounded-2xl lg:col-span-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-500">Temperatura del agua (24h)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-gray-50 rounded-xl text-center">
              <div className="text-xs text-gray-500">Promedio</div>
              <div className="text-lg font-medium">{temp.mean != null ? `${temp.mean.toFixed(1)}°C` : "—"}</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl text-center">
              <div className="text-xs text-gray-500">Mínima</div>
              <div className="text-lg font-medium">{temp.min != null ? `${temp.min.toFixed(1)}°C` : "—"}</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl text-center">
              <div className="text-xs text-gray-500">Máxima</div>
              <div className="text-lg font-medium">{temp.max != null ? `${temp.max.toFixed(1)}°C` : "—"}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}