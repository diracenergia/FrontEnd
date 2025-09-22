import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import React, { useMemo } from "react";

type TankTs = {
  timestamps?: string[];
  level_percent?: Array<number | string | null>;
};

export function TankLevelChart({ ts }: { ts: TankTs | null }) {
  const series = useMemo(() => {
    const t = ts?.timestamps || [];
    const lv = ts?.level_percent || [];
    // Coerce a número y filtrá nulos/no finitos
    const rows = [];
    for (let i = 0; i < Math.min(t.length, lv.length); i++) {
      const n = Number(lv[i]);
      if (Number.isFinite(n)) {
        const iso = t[i] ?? "";
        rows.push({ ts: iso.slice(11, 16), nivel: n });
      }
    }
    return rows;
  }, [ts]);

  const hasData = series.length > 0;

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-gray-500">Nivel del tanque (24h)</CardTitle>
      </CardHeader>
      <CardContent className="h-56">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ts" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
              <Tooltip formatter={(v: any) => [`${Number(v).toFixed(0)}%`, "Nivel"]} />
              <Legend />
              <Line type="monotone" dataKey="nivel" dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full grid place-items-center text-sm text-gray-500">Sin datos</div>
        )}
      </CardContent>
    </Card>
  );
}
