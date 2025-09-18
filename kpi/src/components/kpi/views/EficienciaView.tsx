// src/components/kpi/views/EficienciaView.tsx
import KPI from "../shared/KPI";
import { bandForHour, kwhByBandForPump } from "../utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ResponsiveContainer, PieChart, Pie, Tooltip, Legend } from "recharts";

export default function EficienciaView({ data, pumpId }: { data: any; pumpId: number }) {
  const ts = data.timeseries.pumps[String(pumpId)];
  const bands = kwhByBandForPump(ts);
  const total = bands.total || 1;
  const outOfValle =
    ts?.timestamps?.map((t: string, i: number) => ({ t, h: Number(t.slice(11, 13)), kw: ts.power_kw?.[i] ?? 0 }))
      .filter((r: any) => bandForHour(r.h) !== "VALLE" && r.kw > 0.15) ?? [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="rounded-2xl">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">Distribución de consumo (kWh, 24h)</CardTitle></CardHeader>
        <CardContent className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart><Pie dataKey="value" data={[
              { name: "VALLE", value: bands.VALLE },
              { name: "PICO", value: bands.PICO },
              { name: "RESTO", value: bands.RESTO },
            ]} nameKey="name" outerRadius={90} label /></PieChart>
          </ResponsiveContainer>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
            <div className="p-2 rounded-xl bg-gray-50"><div className="text-xs text-gray-500">VALLE</div><div className="font-medium">{bands.VALLE.toFixed(1)} kWh</div></div>
            <div className="p-2 rounded-xl bg-gray-50"><div className="text-xs text-gray-500">PICO</div><div className="font-medium">{bands.PICO.toFixed(1)} kWh</div></div>
            <div className="p-2 rounded-xl bg-gray-50"><div className="text-xs text-gray-500">RESTO</div><div className="font-medium">{bands.RESTO.toFixed(1)} kWh</div></div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">Eficiencia y horarios</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <KPI label="kWh (24h)" value={total.toFixed(1)} />
            <KPI label="Consumo en VALLE" value={`${((bands.VALLE/total)*100).toFixed(0)}%`} sub="% sobre total 24h" />
          </div>
          <div className="mt-4 text-sm font-medium">Horas fuera de VALLE</div>
          <div className="mt-2 border rounded-2xl max-h-40 overflow-auto text-sm">
            {outOfValle.length === 0 ? <div className="p-3 text-gray-500">Sin consumo fuera de horario VALLE.</div> : (
              <table className="min-w-full">
                <thead className="bg-gray-50 sticky top-0"><tr><th className="text-left p-2">Hora</th><th className="text-left p-2">Banda</th><th className="text-right p-2">kW</th></tr></thead>
                <tbody>{outOfValle.map((r:any)=>(
                  <tr key={r.t} className="border-t"><td className="p-2">{r.t.slice(11,16)}h</td><td className="p-2">{bandForHour(r.h)}</td><td className="p-2 text-right">{r.kw.toFixed(2)}</td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
