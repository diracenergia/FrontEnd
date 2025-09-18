// src/components/kpi/views/ConfiabilidadView.tsx
import React from "react";
import KPI from "../shared/KPI";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { countStarts, availabilityPct, avgOnDurationHours } from "../utils";

type Props = {
  pumpTs?: { is_on?: boolean[] };
  alarms?: Array<{ ts_raised: string }>;
};

function mtbaHours(alarms: Array<{ ts_raised: string }> = []) {
  if (alarms.length < 2) return null;
  const times = alarms
    .map((a) => new Date(a.ts_raised).getTime())
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (times.length < 2) return null;
  let sum = 0;
  for (let i = 1; i < times.length; i++) sum += times[i] - times[i - 1];
  return sum / (times.length - 1) / 3_600_000; // ms → horas
}

export default function ConfiabilidadView({ pumpTs, alarms = [] }: Props) {
  const isOn = pumpTs?.is_on ?? [];
  const starts = countStarts(isOn);
  const avail = availabilityPct(isOn);
  const avgRun = avgOnDurationHours(isOn);
  const mtba = mtbaHours(alarms);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <KPI label="Disponibilidad (24h)" value={`${avail.toFixed(0)}%`} />
      <KPI label="Arranques/día" value={starts} />
      <KPI label="Tiempo medio por ciclo" value={`${avgRun.toFixed(1)} h`} />

      <Card className="rounded-2xl lg:col-span-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-500">MTBA (tiempo medio entre alarmas)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-semibold">{mtba ? `${mtba.toFixed(1)} h` : "—"}</div>
          <div className="text-sm text-gray-500 mt-1">Calculado sobre el histórico disponible.</div>
        </CardContent>
      </Card>
    </div>
  );
}
