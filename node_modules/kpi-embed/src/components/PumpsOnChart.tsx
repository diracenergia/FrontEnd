import React, { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import {
  ResponsiveContainer,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
} from "recharts";

type PumpSeries = {
  timestamps?: string[];
  is_on?: Array<boolean | number | string | null>;
};
type PumpsTimeseries = Record<string, PumpSeries>;

export function PumpsOnChart({ pumpsTs }: { pumpsTs: PumpsTimeseries | null | undefined }) {
  // Entradas (una por bomba)
  const entries = useMemo(() => Object.entries(pumpsTs || {}), [pumpsTs]);

  // Tomamos la serie base para los timestamps (si no hay, no graficamos)
  const base = entries[0]?.[1];

  const data = useMemo(() => {
    const ts = base?.timestamps || [];
    if (!ts.length) return [];

    // Para cada timestamp, contamos cuántas bombas están "on"
    const rows = ts.map((t, i) => {
      const countOn = entries.reduce((acc, [, p]) => {
        const v = p?.is_on?.[i];
        // coerción a boolean seguro
        const b =
          v === true ||
          v === 1 ||
          v === "1" ||
          (typeof v === "string" && v.toLowerCase() === "true");
        return acc + (b ? 1 : 0);
      }, 0);
      return { ts: (t || "").slice(11, 16), bombas_on: countOn };
    });

    return rows;
  }, [entries, base]);

  const maxOn = useMemo(
    () => Math.max(0, ...data.map((d) => d.bombas_on)),
    [data]
  );

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-gray-500">Bombas encendidas (24h)</CardTitle>
      </CardHeader>
      <CardContent className="h-56">
        {data.length === 0 ? (
          <div className="h-full grid place-items-center text-sm text-gray-500">
            Sin datos de estado para bombas.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ts" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} domain={[0, Math.max(1, maxOn)]} />
              <Tooltip formatter={(v: any) => [String(v), "Bombas on"]} />
              <Legend />
              <Bar dataKey="bombas_on" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
