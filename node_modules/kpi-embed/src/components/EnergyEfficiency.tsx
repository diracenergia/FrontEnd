// src/components/EnergyEfficiency.tsx
import React, { useEffect, useRef, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Tooltip,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Bar,
} from "recharts";
import { bandForHour } from "../utils/energy";

// -----------------------------
// Tipos
// -----------------------------
type PumpTS = {
  timestamps: string[];
  is_on?: boolean[];
};

type Props = {
  data: { timeseries: { pumps: Record<string, PumpTS> } };
  pumpId: number;
};

// -----------------------------
// Hook: medir tamaño contenedor
// -----------------------------
function useSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!ref.current) return;
    const obs = new ResizeObserver(([entry]) => {
      const cr = entry.contentRect;
      setSize({ width: cr.width, height: cr.height });
    });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return { ref, ...size };
}

// -----------------------------
// Pie auto-centrado y auto-escalado
// -----------------------------
function AutoPie({
  data,
  legendReserve = 40, // espacio reservado debajo para la leyenda externa
}: {
  data: Array<{ name: string; value: number }>;
  legendReserve?: number;
}) {
  const { ref, width, height } = useSize<HTMLDivElement>();
  const hPlot = Math.max(0, height - legendReserve);

  // Radio: 90% del menor lado / 2 (con aire)
  const radius = Math.floor((Math.min(width, hPlot) / 2) * 0.9);
  const cx = Math.floor(width / 2);
  const cy = Math.floor(hPlot / 2);

  return (
    <div ref={ref} className="w-full" style={{ height: "clamp(200px, 34vh, 340px)" }}>
      {width > 0 && hPlot > 0 ? (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 4, right: 8, bottom: legendReserve, left: 8 }}>
            <Pie
              dataKey="value"
              data={data}
              nameKey="name"
              cx={cx}
              cy={cy}
              outerRadius={radius}
              label={false}
              labelLine={false}
            />
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}

// -----------------------------
// Componente principal
// -----------------------------
export function EnergyEfficiency({ data, pumpId }: Props) {
  const ts = data?.timeseries?.pumps?.[String(pumpId)];

  // Estado vacío
  if (!ts || !Array.isArray(ts.timestamps) || ts.timestamps.length === 0) {
    return (
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-500">Eficiencia (horas)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-500">
          Sin datos de tiempo para la bomba #{pumpId}.
        </CardContent>
      </Card>
    );
  }

  const n = ts.timestamps.length;
  const on = (ts.is_on ?? []).map(Boolean);
  while (on.length < n) on.push(false);

  // Horas encendida por banda (1 punto = 1 hora)
  const acc: Record<"VALLE" | "PICO" | "RESTO", number> = { VALLE: 0, PICO: 0, RESTO: 0 };
  ts.timestamps.forEach((t, i) => {
    if (!on[i]) return;
    const h = Number(t.slice(11, 13));
    const band = bandForHour(h) as keyof typeof acc;
    acc[band] += 1;
  });
  const totalOn = acc.VALLE + acc.PICO + acc.RESTO;

  const pieData = [
    { name: "VALLE", value: acc.VALLE },
    { name: "PICO", value: acc.PICO },
    { name: "RESTO", value: acc.RESTO },
  ];

  const barsData = [
    { banda: "VALLE", horas: acc.VALLE },
    { banda: "PICO", horas: acc.PICO },
    { banda: "RESTO", horas: acc.RESTO },
  ];

  // % por banda
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
  const pctValle = totalOn > 0 ? acc.VALLE / totalOn : 0;
  const pctPico  = totalOn > 0 ? acc.PICO  / totalOn : 0;
  const pctResto = totalOn > 0 ? acc.RESTO / totalOn : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Distribución de horas encendida por banda */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-500">Distribución (horas encendida, 24h)</CardTitle>
        </CardHeader>
        <CardContent className="py-2">
          {totalOn === 0 ? (
            <div className="text-sm text-gray-500">No estuvo encendida en las últimas 24 h.</div>
          ) : (
            <>
              {/* Pie auto-centrado y auto-escalado */}
              <AutoPie data={pieData} legendReserve={40} />

              {/* Leyenda externa (centrada) */}
              <div className="mt-1 flex items-center justify-center gap-6 text-xs text-gray-600">
                {[
                  { name: "VALLE", key: "VALLE" as const },
                  { name: "PICO", key: "PICO" as const },
                  { name: "RESTO", key: "RESTO" as const },
                ].map((it) => (
                  <div key={it.key} className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-500" />
                    <span>{it.name}</span>
                  </div>
                ))}
              </div>

              {/* KPIs (horas) */}
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                <div className="p-2 rounded-xl bg-gray-50">
                  <div className="text-xs text-gray-500">VALLE</div>
                  <div className="font-medium">{acc.VALLE} h</div>
                </div>
                <div className="p-2 rounded-xl bg-gray-50">
                  <div className="text-xs text-gray-500">PICO</div>
                  <div className="font-medium">{acc.PICO} h</div>
                </div>
                <div className="p-2 rounded-xl bg-gray-50">
                  <div className="text-xs text-gray-500">RESTO</div>
                  <div className="font-medium">{acc.RESTO} h</div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Resumen + barras */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-500">Eficiencia y horarios (horas)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="p-3 bg-gray-50 rounded-xl text-center">
              <div className="text-xs text-gray-500">Horas encendida (24h)</div>
              <div className="text-2xl font-semibold">{totalOn}</div>
            </div>

            <div className="p-3 bg-gray-50 rounded-xl text-center">
              <div className="text-xs text-gray-500">En VALLE</div>
              <div className="text-2xl font-semibold">{pct(pctValle)}</div>
              <div className="text-xs text-gray-500 mt-1">% sobre total 24h</div>
            </div>

            <div className="p-3 bg-gray-50 rounded-xl text-center">
              <div className="text-xs text-gray-500">En PICO</div>
              <div className="text-2xl font-semibold">{pct(pctPico)}</div>
              <div className="text-xs text-gray-500 mt-1">% sobre total 24h</div>
            </div>

            <div className="p-3 bg-gray-50 rounded-xl text-center">
              <div className="text-xs text-gray-500">En RESTO</div>
              <div className="text-2xl font-semibold">{pct(pctResto)}</div>
              <div className="text-xs text-gray-500 mt-1">% sobre total 24h</div>
            </div>
          </div>

          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barsData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="banda" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="horas" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
