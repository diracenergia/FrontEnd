// src/components/ReliabilityPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  PieChart,
  Pie,
  Cell,
  Legend,
  Brush,
} from "recharts";
import {
  fetchUptime30dByLocation,
  fetchUptime30dByPump,
  fetchActiveAlarms,
  type UptimePumpRow,
  type UptimeLocRow,
  type Alarm,
} from "@/api/kpi";

type Props = {
  locationId: number | "all";
  thresholdLow?: number; // % bajo el cual es “riesgo”
  topN?: number;         // cuántas peores listar
};

const COLORS = {
  ok: "#10B981",
  risk: "#F97316",
  critical: "#EF4444",
  textMuted: "#6B7280",
};

export default function ReliabilityPage({
  locationId,
  thresholdLow = 90,
  topN = 8,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [pumps, setPumps] = useState<UptimePumpRow[]>([]);
  const [locRows, setLocRows] = useState<UptimeLocRow[]>([]);
  const [alarms, setAlarms] = useState<Alarm[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const [rowsPump, rowsLoc, alarmsActive] = await Promise.all([
          fetchUptime30dByPump({ location_id: locationId }),
          fetchUptime30dByLocation({ location_id: locationId }),
          fetchActiveAlarms({ location_id: locationId }),
        ]);
        if (!mounted) return;
        setPumps(rowsPump || []);
        setLocRows(rowsLoc || []);
        setAlarms((alarmsActive || []).filter(a => a.is_active));
      } catch (e) {
        console.error("[ReliabilityPage] load error", e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [locationId]);

  // Normalizamos filas { name, uptime, pump_id }
  const rows = useMemo(() => {
    const pick = (r: UptimePumpRow) =>
      typeof r.uptime_pct_30d === "number" ? r.uptime_pct_30d :
      typeof r.uptime_pct === "number" ? r.uptime_pct : null;

    return (pumps || [])
      .map(r => ({
        pump_id: r.pump_id,
        name: r.name || `pump #${r.pump_id}`,
        uptime: Number(pick(r) ?? 0),
      }))
      .filter(r => Number.isFinite(r.uptime));
  }, [pumps]);

  // Ordenado ascendente (peores primero)
  const rowsSortedAsc = useMemo(
    () => [...rows].sort((a, b) => a.uptime - b.uptime),
    [rows]
  );

  // Ancho del eje Y dinámico según largo de nombres
  const yAxisWidth = useMemo(() => {
    const maxLen = rowsSortedAsc.reduce((m, r) => Math.max(m, (r.name ?? "").length), 0);
    return Math.min(220, Math.max(80, Math.round(maxLen * 7.2)));
  }, [rowsSortedAsc]);

  // KPIs superiores
  const kpis = useMemo(() => {
    const total = rows.length;
    const risk = rows.filter(r => r.uptime < thresholdLow).length;
    const ok = total - risk;
    const avg = rows.length ? rows.reduce((a, b) => a + b.uptime, 0) / rows.length : 0;
    const worst = rowsSortedAsc[0]?.uptime ?? 0;
    const best = rowsSortedAsc.length ? rowsSortedAsc[rowsSortedAsc.length - 1].uptime : 0;

    const alarmsActive = alarms.length;
    const alarmsCritical = alarms.filter(a => a.severity === "critical").length;

    // Si el backend da uptimes por ubicación, usamos su promedio
    const avgLoc = (locRows || [])
      .map(r => Number(r.uptime_pct_30d ?? r.uptime_pct ?? NaN))
      .filter(Number.isFinite);
    const avgFromLoc = avgLoc.length ? (avgLoc.reduce((a, b) => a + b, 0) / avgLoc.length) : null;

    return { total, ok, risk, avg: avgFromLoc ?? avg, worst, best, alarmsActive, alarmsCritical };
  }, [rows, rowsSortedAsc, alarms, locRows, thresholdLow]);

  const donutData = useMemo(() => ([
    { name: "OK", value: kpis.ok, key: "ok" as const, color: COLORS.ok },
    { name: "En riesgo", value: kpis.risk, key: "risk" as const, color: COLORS.risk },
  ]), [kpis.ok, kpis.risk]);

  const worstList = useMemo(() => rowsSortedAsc.slice(0, topN), [rowsSortedAsc, topN]);
  const barColorFor = (uptime: number) => uptime < thresholdLow ? COLORS.risk : COLORS.ok;
  const fmtPct = (n: number) => `${n.toFixed(1)}%`;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {/* KPIs en 2 columnas x 2 filas (sin huecos) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatTile
          title="Uptime promedio (30d)"
          value={fmtPct(kpis.avg)}
          accent="#111827"
        />
        <StatTile
          title="Bombas en riesgo"
          value={`${kpis.risk}`}
          subtitle={`umbral < ${thresholdLow}%`}
          accent={kpis.risk > 0 ? COLORS.risk : COLORS.ok}
          valueColor={kpis.risk > 0 ? COLORS.risk : COLORS.ok}
        />
        <StatTile
          title="Alarmas activas"
          value={`${kpis.alarmsActive}`}
          subtitle={kpis.alarmsCritical > 0 ? `críticas: ${kpis.alarmsCritical}` : undefined}
          accent={kpis.alarmsCritical > 0 ? COLORS.critical : COLORS.textMuted}
          subtitleColor={kpis.alarmsCritical > 0 ? COLORS.critical : COLORS.textMuted}
        />
        <Card className="rounded-2xl min-h-[120px]">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-gray-500">Mejor / Peor</CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col">
                <span className="text-xs text-gray-500">Mejor</span>
                <span className="text-2xl font-semibold font-mono tabular-nums" style={{ color: COLORS.ok }}>
                  {fmtPct(kpis.best)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-gray-500">Peor</span>
                <span className="text-2xl font-semibold font-mono tabular-nums" style={{ color: COLORS.risk }}>
                  {fmtPct(kpis.worst)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Donut OK vs En riesgo */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-500">Estado de bombas</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          {rows.length === 0 ? (
            <div className="h-full grid place-items-center text-sm text-gray-500">Sin datos</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={92}
                  labelLine={false}
                  label={(d: any) => `${d.name} ${d.value}`}
                >
                  {donutData.map(d => <Cell key={d.key} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v: any, n: any) => [String(v), n]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* === MISMA FILA: gráfico (2/3) + lista (1/3) === */}
      <div className="xl:col-span-2">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Gráfico */}
          <Card className="rounded-2xl xl:col-span-2">
            <CardHeader className="pb-2 flex items-center justify-between">
              <CardTitle className="text-sm text-gray-500">Uptime por bomba (30d aprox.)</CardTitle>
            </CardHeader>
            <CardContent className="h-96">
              {rows.length === 0 ? (
                <div className="h-full grid place-items-center text-sm text-gray-500">Sin datos</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={rowsSortedAsc}
                    layout="vertical"
                    margin={{ top: 10, right: 16, bottom: 10, left: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis type="number" domain={[0, 100]} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={yAxisWidth}
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      interval={0}
                    />
                    <Tooltip formatter={(v: any) => [`${Number(v).toFixed(1)}%`, "Uptime"]} />
                    <ReferenceLine
                      x={thresholdLow}
                      stroke={COLORS.risk}
                      strokeDasharray="4 4"
                      label={{ value: `umbral ${thresholdLow}%`, position: "top", fontSize: 10 }}
                    />
                    <Bar dataKey="uptime" isAnimationActive={false} barSize={14}>
                      {rowsSortedAsc.map((r, i) => (
                        <Cell key={i} fill={barColorFor(r.uptime)} />
                      ))}
                    </Bar>
                    {rowsSortedAsc.length > 15 && (
                      <Brush dataKey="name" height={22} stroke="currentColor" travellerWidth={8} />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Lista de peores */}
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-500">Peores {topN} bombas</CardTitle>
            </CardHeader>
            <CardContent>
              {worstList.length === 0 ? (
                <div className="text-sm text-gray-500">Sin datos</div>
              ) : (
                <ul className="text-sm divide-y">
                  {worstList.map((r) => (
                    <li key={r.pump_id} className="py-2 flex items-center justify-between">
                      <span className="truncate">{r.name}</span>
                      <span className="font-semibold" style={{ color: barColorFor(r.uptime) }}>
                        {r.uptime.toFixed(1)}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ---------- Subcomponentes ---------- */
function StatTile({
  title,
  value,
  subtitle,
  accent = "#111827",
  valueColor,
  subtitleColor = COLORS.textMuted,
}: {
  title: string;
  value: string;
  subtitle?: string;
  accent?: string;           // color de barra lateral
  valueColor?: string;       // color del número
  subtitleColor?: string;    // color del subtítulo
}) {
  return (
    <Card className="rounded-2xl min-h-[120px]">
      <CardHeader className="pb-1 flex items-center gap-3">
        <span className="inline-block h-6 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
        <CardTitle className="text-sm text-gray-500">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-1">
        <div className="text-3xl font-semibold font-mono tabular-nums" style={{ color: valueColor ?? "#111827" }}>
          {value}
        </div>
        {subtitle && (
          <div className="text-xs mt-1" style={{ color: subtitleColor }}>
            {subtitle}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
