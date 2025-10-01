// src/lib/kpiConfig.ts
type AnyObj = Record<string, any>;

export type KpiCtx = {
  orgId: number;
  apiBase: string;
  apiKey?: string;
  authInQuery?: boolean;
  locationId?: number | null;
  locationCode?: string | null;
};

function resolveKpiCtx(): KpiCtx {
  const w = window as any;
  const fromWin = (w.__KPI_CTX__ || w.__APP_CTX__ || {}) as Partial<KpiCtx>;
  const env: AnyObj = (import.meta as any)?.env ?? {};

  const apiBase = String(fromWin.apiBase || env.VITE_API_URL || env.VITE_API_BASE || "").replace(/\/+$/, "");
  const orgId = Number(fromWin.orgId ?? env.VITE_ORG_ID ?? 0) || 1;
  const apiKey = fromWin.apiKey || env.VITE_API_KEY || undefined;
  const authInQuery = Boolean(fromWin.authInQuery ?? (env.VITE_AUTH_IN_QUERY === "1"));

  const locationId =
    fromWin.locationId ??
    (env.VITE_LOCATION_ID != null ? Number(env.VITE_LOCATION_ID) : null) ??
    null;

  const locationCode =
    (fromWin.locationCode as any) ??
    (env.VITE_LOCATION_CODE as any) ??
    null;

  if (!apiBase) throw new Error("[KPI] apiBase vacío: esperá EMBED_INIT o definí VITE_API_URL");
  return { orgId, apiBase, apiKey, authInQuery, locationId, locationCode };
}

/** ✅ Guardar/mergear ctx en runtime (llamado desde main.tsx) */
export function applyKpiCtx(next: Partial<KpiCtx>) {
  const w = window as any;
  w.__KPI_CTX__ = { ...(w.__KPI_CTX__ || {}), ...next };
}

/** ✅ Leer el ctx actual resuelto (org/ubicación/api) */
export function currentKpiCtx(): KpiCtx {
  return resolveKpiCtx();
}

// ---- util de params
function toParamString(_key: string, v: any): string | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    if ("id" in v) return toParamString("", (v as any).id);
    if ("value" in v) return toParamString("", (v as any).value);
    return null;
  }
  return null;
}

export function buildUrl(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null | any>
) {
  const { apiBase, orgId, authInQuery, locationId, locationCode } = resolveKpiCtx();
  const clean = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(clean, apiBase);

  if (authInQuery && !url.searchParams.has("org_id")) {
    url.searchParams.set("org_id", String(orgId));
  }
  if (authInQuery) {
    if (locationCode && !url.searchParams.has("location_code")) url.searchParams.set("location_code", String(locationCode));
    else if (locationId != null && !url.searchParams.has("location_id")) url.searchParams.set("location_id", String(locationId));
  }

  if (params) {
    for (const [k, raw] of Object.entries(params)) {
      if (raw === undefined || raw === null) continue;
      if (Array.isArray(raw)) {
        for (const item of raw) {
          const sv = toParamString(k, item);
          if (sv != null) url.searchParams.append(k, sv);
        }
        continue;
      }
      const sv = toParamString(k, raw);
      if (sv != null) url.searchParams.set(k, sv);
      else console.warn(`[KPI] parámetro descartado (no serializable): ${k}=`, raw);
    }
  }
  return url.toString();
}

export function defaultHeaders(): HeadersInit {
  const { orgId, apiKey, locationId, locationCode } = resolveKpiCtx();
  return {
    "Content-Type": "application/json",
    "X-Org-Id": String(orgId),
    ...(locationId != null ? { "X-Location-Id": String(locationId) } : {}),
    ...(locationCode ? { "X-Location-Code": String(locationCode) } : {}),
    ...(apiKey ? { "x-api-key": String(apiKey) } : {}),
  };
}
