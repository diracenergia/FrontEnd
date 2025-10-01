// src/data/loadDashboard.ts
import { MOCK_DATA } from "./mock";
import { buildUrl, defaultHeaders, currentKpiCtx } from "../lib/kpiConfig";

type AnyObj = Record<string, any>;

export type DashboardData = {
  overview?: AnyObj;
  locations?: AnyObj[];
  byLocation?: AnyObj[];
  org?: AnyObj;
  kpis?: AnyObj;
  assets?: AnyObj[];
  latest?: AnyObj[];
  timeseries?: AnyObj;
  alarms?: AnyObj[];
  analytics30d?: AnyObj;
  topology?: AnyObj;
};

const DEBUG = true;

async function getJSON<T = AnyObj>(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
  init?: RequestInit
): Promise<T | null> {
  const url = buildUrl(path, params);
  const headers: HeadersInit = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...defaultHeaders(),          // inyecta org/ubicación/API key
    ...(init?.headers ?? {}),
  };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000);

  try {
    if (DEBUG) {
      const u = new URL(url);
      console.groupCollapsed(`[getJSON] → ${u.pathname}${u.search}`);
      console.log("method = GET");
      console.log("headers =", headers);
      console.groupEnd();
    }

    const res = await fetch(url, { method: "GET", ...init, headers, signal: controller.signal, credentials: "same-origin" });
    const bodyText = await res.text();
    if (!res.ok) {
      console.warn(`[getJSON] ${res.status} ${res.statusText} -> ${url}`, bodyText);
      return null;
    }
    try {
      const json = JSON.parse(bodyText);
      if (DEBUG) {
        const u = new URL(url);
        console.groupCollapsed(`[getJSON] ✓ ${u.pathname}${u.search}`);
        console.log("payload =", json);
        console.groupEnd();
      }
      return json as T;
    } catch (e) {
      console.warn(`[getJSON] JSON parse error -> ${url}`, e);
      return null;
    }
  } catch (err: any) {
    console.warn(`[getJSON] error -> ${url}`, err?.message || err);
    return null;
  } finally { clearTimeout(t); }
}

function logOpt(path: string, e: any) {
  console.warn(`[loadDashboard] opcional ${path}:`, e?.message || e);
}

export async function loadDashboard(): Promise<DashboardData> {
  const result: DashboardData = { ...MOCK_DATA };
  const env: any = (import.meta as any)?.env ?? {};
  const DEFAULT_WINDOW = (env.VITE_KPI_WINDOW ?? "7d").toString();

  // Ubicación actual (para compat con endpoints que lo piden por query)
  const { locationId, locationCode } = currentKpiCtx();
  const locParams =
    locationCode ? { location_code: String(locationCode) }
    : (locationId != null ? { loc_id: Number(locationId) } : {});

  // 1) overview (principal) — enviamos window + ubicación por query (además de headers)
  await getJSON("/kpi/overview", { window: DEFAULT_WINDOW, ...locParams })
    .then((v) => (result.overview = v ?? result.overview))
    .catch((err) => console.warn("[loadDashboard] /kpi/overview:", err?.message || err));

  // 2) adicionales (por lo general no requieren filtro por loc)
  await Promise.all([
    getJSON("/kpi/locations")
      .then((v) => (result.locations = Array.isArray(v) ? v : result.locations))
      .catch((e) => logOpt("/kpi/locations", e)),

    getJSON("/kpi/by-location")
      .then((v) => (result.byLocation = Array.isArray(v) ? v : result.byLocation))
      .catch((e) => logOpt("/kpi/by-location", e)),
  ]);

  if (DEBUG) {
    console.groupCollapsed("[loadDashboard] RESULT");
    console.log("overview.keys =", result.overview ? Object.keys(result.overview) : "(null)");
    console.log("locations.count =", result.locations?.length ?? 0);
    console.log("byLocation.count =", result.byLocation?.length ?? 0);
    console.groupEnd();
  }

  return result;
}
