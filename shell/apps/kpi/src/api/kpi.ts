// src/api/kpi.ts
// Fetchers tipados para /kpi/* con headers compatibles: X-Org-Id y x_org_id

const API_BASE_RAW = (import.meta.env.VITE_API_BASE ?? "https://backend-v85n.onrender.com").toString().trim();
const API_BASE = API_BASE_RAW.replace(/\/$/, "");

const ORG_ID_RAW = (import.meta.env.VITE_ORG_ID ?? "").toString().trim();
const ORG_ID = Number(ORG_ID_RAW);

// fallá temprano si falta el ORG_ID
if (!Number.isFinite(ORG_ID) || ORG_ID <= 0) {
  // mostrás esto en consola y evitás llamadas 400 en loop
  console.error("[KPI] VITE_ORG_ID inválido o vacío. Definí VITE_ORG_ID en tu .env y reiniciá Vite.");
  throw new Error("VITE_ORG_ID inválido o vacío. Definí VITE_ORG_ID en tu .env y reiniciá Vite.");
}

function buildUrl(path: string, params?: Record<string, any>) {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "" && v !== false) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function getJSON<T>(path: string, params?: Record<string, any>) {
  const url = buildUrl(path, params);
  const headers: HeadersInit = {
    "X-Org-Id": String(ORG_ID),  // kebab-case
    "x_org_id": String(ORG_ID),  // underscore (tu backend lo requiere)
  };

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.error("[KPI][ERR]", res.status, res.statusText, url, txt);
    throw new Error(`[${res.status}] ${url}`);
  }
  return (await res.json()) as T;
}

/** 0) eje temporal 24h */
export type TimeBucket = { local_hour: string };
export const fetchTimeBuckets24h = () =>
  getJSON<TimeBucket[]>("/kpi/time-buckets/hourly-24h");

/** 1) bombas con lectura (por hora, por loc) */
export type PumpActivityRow = {
  org_id?: number;
  location_id?: number;
  location_code?: string | null;
  location_name?: string | null;
  local_hour: string;
  pumps_with_reading?: number | null;
  pumps_count?: number | null;
  count?: number | null;
};
export const fetchPumpsActivity24h = (p: { location_id?: number | "all" } = {}) =>
  getJSON<PumpActivityRow[]>("/kpi/pumps/activity/hourly-24h", {
    location_id: p.location_id === "all" ? undefined : p.location_id,
  });

/** 2) tanques nivel promedio (por hora, agregado por loc) */
export type TankLevelAvgLocRow = {
  org_id?: number;
  location_id?: number;
  location_code?: string | null;
  location_name?: string | null;
  local_hour: string;
  level_avg_pct?: number | null;    // alias usual
  avg_level_pct?: number | null;    // alias alternativo
};
export const fetchTankLevelAvg24hByLocation = (p: { location_id?: number | "all" } = {}) =>
  getJSON<TankLevelAvgLocRow[]>("/kpi/tanks/level-avg/hourly-24h/by-location", {
    location_id: p.location_id === "all" ? undefined : p.location_id,
  });

/** 3) inventario por localidad */
export type TotalsByLocationRow = {
  location_id: number;
  location_code?: string | null;
  location_name: string;
  tanks_count?: number | null; tanks_total?: number | null; tanks?: number | null;
  pumps_count?: number | null; pumps_total?: number | null; pumps?: number | null;
  valves_count?: number | null; valves_total?: number | null; valves?: number | null;
  manifolds_count?: number | null; manifolds_total?: number | null; manifolds?: number | null;
};
export const fetchTotalsByLocation = (p: { location_id?: number | "all" } = {}) =>
  getJSON<TotalsByLocationRow[]>("/kpi/totals/by-location", {
    location_id: p.location_id === "all" ? undefined : p.location_id,
  });

/** 4) uptime 30d por localidad */
export type UptimeLocRow = {
  location_id: number;
  location_name?: string | null;
  uptime_pct_30d?: number | null;
  uptime_pct?: number | null;
};
export const fetchUptime30dByLocation = (p: { location_id?: number | "all" } = {}) =>
  getJSON<UptimeLocRow[]>("/kpi/uptime/pumps/30d/by-location", {
    location_id: p.location_id === "all" ? undefined : p.location_id,
  });


// --- 4b) uptime 30d por bomba (detalle) ---
export type UptimePumpRow = {
  location_id?: number | null;
  location_name?: string | null;
  pump_id?: number | null;
  pump_name?: string | null;
  uptime_pct_30d?: number | null; // preferente
  uptime_pct?: number | null;     // alias tolerado
};

export const fetchUptime30dByPump = (p: { location_id?: number | "all" } = {}) =>
  getJSON<UptimePumpRow[]>("/kpi/uptime/pumps/30d/by-pump", {
    location_id: p.location_id === "all" ? undefined : p.location_id,
  });



/** 5) alarmas activas por severidad */
export type AlarmsBySevRow = {
  location_id?: number | null;
  location_name?: string | null;
  severity: string;
  count: number;
};
export const fetchActiveAlarms = (p: { location_id?: number | "all" } = {}) =>
  getJSON<AlarmsBySevRow[]>("/kpi/alarms/active/by-severity", {
    location_id: p.location_id === "all" ? undefined : p.location_id,
  });

/** 9) lista de localidades */
export type LocationRow = { id: number; code?: string | null; name: string };
export const fetchLocations = () => getJSON<LocationRow[]>("/kpi/locations");
