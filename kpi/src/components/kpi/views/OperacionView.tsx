// src/components/kpi/views/OperacionView.tsx
import React from "react";
import type { KpiPayload, TankTS, PumpTS } from "../types";
import KPI from "../shared/KPI";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
// importa tus charts / componentes que uses acá
import TankLevelChart from "../shared/TankLevelChart";
import PumpPowerChart from "../shared/PumpPowerChart";

type Props = {
  data: KpiPayload;
  tankTs?: TankTS;
  pumpTs?: PumpTS;
};

const k = (n: number) => new Intl.NumberFormat("es-AR").format(n);
const pct = (n: number) => `${n.toFixed(1)}%`;

export default function OperacionView({ data, tankTs, pumpTs }: Props) {
  return (
    <>
      {/* KPIs */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPI label="Activos" value={k(data.kpis.assets_total)} />
        <KPI label="Tanques" value={k(data.kpis.tanks)} />
        <KPI label="Bombas" value={k(data.kpis.pumps)} />
        <KPI label="Valv." value={k(data.kpis.valves)} />
        <KPI label="Alarmas activas" value={k(data.kpis.alarms_active)} />
        <KPI label="Nivel prom. (30d)" value={pct(data.kpis.avg_level_pct_30d)} />
      </section>

      {/* Gráficos */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Nivel del tanque (24h)</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            {tankTs ? <TankLevelChart ts={tankTs} /> : <div className="text-sm">Sin datos</div>}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">kW consumidos (24h)</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            {pumpTs ? <PumpPowerChart ts={pumpTs} /> : <div className="text-sm">Sin datos</div>}
          </CardContent>
        </Card>
      </section>
    </>
  );
}
