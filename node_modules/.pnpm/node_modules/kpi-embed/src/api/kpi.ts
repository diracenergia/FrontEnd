// src/api/kpi.ts
import { buildUrl, defaultHeaders } from "../lib/kpiConfig";

type AnyObj = Record<string, any>;

function toIntOrUndef(v: any): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  if (typeof v === "object") {
    if ("id" in v)   return toIntOrUndef((v as any).id);
    if ("value" in v) return toIntOrUndef((v as any).value);
  }
  return undefined;
}

async function getJSON<T = any>(
  path: string,
  params?: AnyObj,
  init?: RequestInit
): Promise<T> {
  const url = buildUrl(path, params);
  const res = await fetch(url, {
    method: "GET",
    ...init,
    headers: { ...defaultHeaders(), ...(init?.headers || {}) },
    credentials: "omit",
  });

  const txt = await res.text().catch(() => "");
  if (!res.ok) {
    console.warn("[KPI][ERR]", res.status, res.statusText, url, txt);
    throw new Error(`[${res.status}] ${url}`);
  }
  return (txt ? JSON.parse(txt) : null) as T;
}

/* ===== Endpoints reales (app/routes/kpi.py) ===== */

export const fetchTimeBuckets24h = () =>
  getJSON("/kpi/time-buckets/hourly-24h");

export const fetchPumpsActivity24h = (location_id?: any) =>
  getJSON("/kpi/pumps/activity/hourly-24h", {
    location_id: toIntOrUndef(location_id),
  });

export const fetchTankLevelAvg24hByLocation = (location_id?: any) =>
  getJSON("/kpi/tanks/level-avg/hourly-24h/by-location", {
    location_id: toIntOrUndef(location_id),
  });

export const fetchTotalsByLocation = (location_id?: any) =>
  getJSON("/kpi/totals/by-location", {
    location_id: toIntOrUndef(location_id),
  });

export const fetchUptime30dByLocation = (location_id?: any) =>
  getJSON("/kpi/uptime/pumps/30d/by-location", {
    location_id: toIntOrUndef(location_id),
  });

export const fetchUptime30dByPump = (location_id?: any) =>
  getJSON("/kpi/uptime/pumps/30d/by-pump", {
    location_id: toIntOrUndef(location_id),
  });

export const fetchActiveAlarms = (location_id?: any) =>
  getJSON("/kpi/alarms/active/by-severity", {
    location_id: toIntOrUndef(location_id),
  });

export const fetchLocations = () =>
  getJSON("/kpi/locations");
