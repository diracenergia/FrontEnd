// src/data/loadDashboard.ts
import { MOCK_DATA } from "./mock";

/**
 * Resolución de contexto KPI en runtime:
 * prioridad: overrides -> window.__KPI_CTX__ -> window.__APP_CTX__ -> ?org= -> VITE_*
 */
type AnyObj = Record<string, any>;

export type KpiCtx = {
  orgId: number;
  apiBase: string;
  apiKey?: string;
  authInQuery?: boolean;
  wsBase?: string;
};

declare global {
  interface Window {
    __APP_CTX__?: Partial<KpiCtx>;
    __KPI_CTX__?: Partial<KpiCtx>;
  }
}

function resolveCtx(overrides?: Partial<KpiCtx>): KpiCtx {
  const env: any = (import.meta as any)?.env ?? {};
  const q = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
  const win: any = (typeof window !== "undefined" ? window : {}) as any;

  const orgCandidates = [
    overrides?.orgId,
    win.__KPI_CTX__?.orgId,
    win.__APP_CTX__?.orgId,
    Number(q.get("org")),
    Number(env.VITE_ORG_ID),
  ].filter((v) => Number.isFinite(v) && (v as number) > 0) as number[];

  const orgId = orgCandidates[0] || 1; // fallback dev seguro

  // Acepta VITE_API_BASE o VITE_API_URL
  const apiBase = (
    overrides?.apiBase ??
    win.__KPI_CTX__?.apiBase ??
    win.__APP_CTX__?.apiBase ??
    env.VITE_API_BASE ??
    env.VITE_API_URL ??
    ""
  )
    .toString()
    .trim()
    .replace(/\/$/, "");

  const apiKey =
    overrides?.apiKey ?? win.__KPI_CTX__?.apiKey ?? win.__APP_CTX__?.apiKey ?? env.VITE_API_KEY ?? undefined;

  const authInQuery = Boolean(
    overrides?.authInQuery ??
      win.__KPI_CTX__?.authInQuery ??
      win.__APP_CTX__?.authInQuery ??
      (env.VITE_AUTH_IN_QUERY === "1")
  );

  const ctx: KpiCtx = { orgId, apiBase, apiKey: apiKey ? String(apiKey) : undefined, authInQuery };

  // Persistimos para lecturas futuras
  win.__KPI_CTX__ = { ...win.__KPI_CTX__, ...ctx };
  if (!apiBase) console.warn("[KPI] apiBase vacío; pasá ctx.apiBase o VITE_API_BASE/VITE_API_URL.");
  return ctx;
}

// ======================
// Config y utilitarios
// ======================
const DEBUG = true;
const SEND_ORG_AS_QUERY = false; // si tu backend lo necesita por query, ponelo en true
const ctx = resolveCtx();

function buildUrl(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>
) {
  if (!ctx.apiBase) throw new Error("API base no configurada (ctx.apiBase / VITE_API_BASE/VITE_API_URL)");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(cleanPath, ctx.apiBase);

  if (SEND_ORG_AS_QUERY) {
    // Algunos backends aceptan org como query (además del header)
    if (!url.searchParams.has("org") && !url.searchParams.has("org_id")) {
      url.searchParams.set("org", String(ctx.orgId));
    }
  }

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url;
}

async function getJSON<T = AnyObj>(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
  init?: RequestInit
): Promise<T | null> {
  const url = buildUrl(path, params);
  const headers: HeadersInit = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "X-Org-Id": String(ctx.orgId),  // kebab-case
    "x_org_id": String(ctx.orgId),  // underscore (compat)
    ...(init?.headers ?? {}),
  };
  if (ctx.apiKey) (headers as any)["x-api-key"] = String(ctx.apiKey);

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000);

  try {
    if (DEBUG) {
      console.groupCollapsed(`[getJSON] → ${url.pathname}${url.search}`);
      console.log("method = GET");
      console.log("headers =", headers);
      console.groupEnd();
    }

    const res = await fetch(url.toString(), {
      method: "GET",
      ...init,
      headers,
      signal: controller.signal,
      credentials: "same-origin",
    });

    const bodyText = await res.text();
    if (!res.ok) {
      console.warn(`[getJSON] ${res.status} ${res.statusText} -> ${url}`, bodyText);
      return null;
    }
    try {
      const json = JSON.parse(bodyText);
      if (DEBUG) {
        console.groupCollapsed(`[getJSON] ✓ ${url.pathname}${url.search}`);
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
  } finally {
    clearTimeout(t);
  }
}

// ======================
// Tipos y carga de KPI
// ======================
export type DashboardData = {
  overview?: AnyObj;      // /kpi/overview  (incluye assets, latest, timeseries, alarms, analytics30d, topology)
  locations?: AnyObj[];   // /kpi/locations
  byLocation?: AnyObj[];  // /kpi/by-location
  // Legacy (compat MOCK_DATA):
  org?: AnyObj;
  kpis?: AnyObj;
  assets?: AnyObj[];
  latest?: AnyObj[];
  timeseries?: AnyObj;
  alarms?: AnyObj[];
  analytics30d?: AnyObj;
  topology?: AnyObj;
};

function logOpt(path: string, e: any) {
  console.warn(`[loadDashboard] opcional ${path}:`, e?.message || e);
}

export async function loadDashboard(): Promise<DashboardData> {
  const result: DashboardData = { ...MOCK_DATA };

  const env: any = (import.meta as any)?.env ?? {};
  const DEFAULT_LOC_ID = Number(env.VITE_LOCATION_ID ?? 1) || 1;
  const DEFAULT_WINDOW = (env.VITE_KPI_WINDOW ?? "7d").toString();

  // 1) overview (principal)
  await getJSON("/kpi/overview", { loc_id: DEFAULT_LOC_ID, window: DEFAULT_WINDOW })
    .then((v) => (result.overview = v ?? result.overview))
    .catch((err) => console.warn("[loadDashboard] /kpi/overview:", err?.message || err));

  // 2) endpoints reales adicionales
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
