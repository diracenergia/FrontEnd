// src/data/loadFromApi.ts
import {
  fetchActiveAlarms,
  fetchLocations,
  fetchPumpsActivity24h,
  fetchTankLevelAvg24hByLocation,
  fetchTimeBuckets24h,
  fetchTotalsByLocation,
  fetchUptime30dByLocation,
  PumpActivityRow,
  TankLevelAvgLocRow,
  TotalsByLocationRow,
  UptimeLocRow,
} from "@/api/kpi";

type AnyObj = Record<string, any>;
const pickNum = (r: AnyObj, ks: string[], fb = 0) => {
  for (const k of ks) if (r[k] != null) return Number(r[k]);
  return fb;
};

function normalize24h(
  buckets: string[],
  rows: AnyObj[],
  tsKey: string,
  valueKey: string,
  agg: (xs: number[]) => number
) {
  const m = new Map<string, number[]>();
  for (const r of rows) {
    const t = String(r[tsKey]);
    const v = Number(r[valueKey] ?? 0);
    const arr = m.get(t) || [];
    arr.push(Number.isFinite(v) ? v : 0);
    m.set(t, arr);
  }
  return buckets.map((t) => agg(m.get(t) || []));
}

export async function loadDashboard(location_id?: number | "all") {
  const [locations, totals, uptime, alarms, buckets, pumps, tanks] = await Promise.all([
    fetchLocations(),
    fetchTotalsByLocation({ location_id }),
    fetchUptime30dByLocation({ location_id }),
    fetchActiveAlarms({ location_id }),
    fetchTimeBuckets24h(),
    fetchPumpsActivity24h({ location_id }),
    fetchTankLevelAvg24hByLocation({ location_id }),
  ]);

  // tabla por ubicación + uptime
  const uptimeByLoc = new Map<number, number>();
  (uptime as UptimeLocRow[]).forEach((u) =>
    uptimeByLoc.set(u.location_id, pickNum(u as AnyObj, ["uptime_pct_30d", "uptime_pct"], null as any))
  );

  const byLocation = (totals as TotalsByLocationRow[]).map((t: any) => ({
    location_id: Number(t.location_id),
    location_code: t.location_code ?? t.code ?? null,
    location_name: t.location_name ?? t.name ?? "",
    tanks_count: pickNum(t, ["tanks_count", "tanks_total", "tanks"]),
    pumps_count: pickNum(t, ["pumps_count", "pumps_total", "pumps"]),
    valves_count: pickNum(t, ["valves_count", "valves_total", "valves"]),
    manifolds_count: pickNum(t, ["manifolds_count", "manifolds_total", "manifolds"]),
    uptime_pct_30d: uptimeByLoc.get(Number(t.location_id)) ?? null,
  }));

  // series 24h
  const ts = (buckets || []).map((b) => b.local_hour);

  const pumpKey = (() => {
    const s = (pumps?.[0] || {}) as PumpActivityRow;
    if ("pumps_with_reading" in s) return "pumps_with_reading";
    if ("pumps_count" in s) return "pumps_count";
    return "count";
  })();

  const pumpsPerHour = normalize24h(
    ts,
    pumps as AnyObj[],
    "local_hour",
    pumpKey,
    (xs) => xs.reduce((a, b) => a + b, 0)
  );

  const tankKey = (() => {
    const s = (tanks?.[0] || {}) as TankLevelAvgLocRow;
    if ("level_avg_pct" in s) return "level_avg_pct";
    if ("avg_level_pct" in s) return "avg_level_pct";
    return "level_avg_pct";
  })();

  const levelAvgPerHour = normalize24h(
    ts,
    tanks as AnyObj[],
    "local_hour",
    tankKey,
    (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  );

  return {
    locations,
    byLocation,
    overview: { alarms },
    pumpTs: { timestamps: ts, is_on: pumpsPerHour },
    tankTs: { timestamps: ts, level_percent: levelAvgPerHour },
  };
}
