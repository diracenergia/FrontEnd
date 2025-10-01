// src/lib/kpiConfig.ts
type AnyObj = Record<string, any>;

export type KpiCtx = {
  orgId: number;
  apiBase: string;
  apiKey?: string;
  authInQuery?: boolean;
};

function resolveKpiCtx(): KpiCtx {
  const w = window as any;
  const fromWin = (w.__KPI_CTX__ || w.__APP_CTX__ || {}) as Partial<KpiCtx>;
  const env: any = (import.meta as any)?.env ?? {};

  const apiBase = String(fromWin.apiBase || env.VITE_API_URL || env.VITE_API_BASE || "").replace(/\/+$/,"");
  const orgId = Number(fromWin.orgId || env.VITE_ORG_ID || 0) || 1;
  const apiKey = fromWin.apiKey || env.VITE_API_KEY || undefined;
  const authInQuery = Boolean(fromWin.authInQuery ?? (env.VITE_AUTH_IN_QUERY === "1"));

  if (!apiBase) {
    throw new Error("[KPI] apiBase vacío: esperá EMBED_INIT o definí VITE_API_URL");
  }
  return { orgId, apiBase, apiKey, authInQuery };
}

// 👇 Coerción robusta para query params (evita [object Object])
function toParamString(key: string, v: any): string | null {
  if (v == null) return null;

  // Soportar números y booleanos
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  if (typeof v === "boolean") return v ? "1" : "0";

  // Strings válidos
  if (typeof v === "string") return v;

  // Objetos comunes de selects: {id}, {value}
  if (typeof v === "object") {
    if ("id" in v) return toParamString(key, (v as any).id);
    if ("value" in v) return toParamString(key, (v as any).value);
    return null;
  }

  return null;
}

export function buildUrl(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null | any>
) {
  const { apiBase, orgId, authInQuery } = resolveKpiCtx();
  const clean = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(clean, apiBase);

  if (authInQuery && !url.searchParams.has("org_id")) {
    url.searchParams.set("org_id", String(orgId));
  }

  if (params) {
    for (const [k, raw] of Object.entries(params)) {
      if (raw === undefined || raw === null) continue;

      // Arrays → repetir clave
      if (Array.isArray(raw)) {
        for (const item of raw) {
          const sv = toParamString(k, item);
          if (sv != null) url.searchParams.append(k, sv);
        }
        continue;
      }

      const sv = toParamString(k, raw);
      if (sv != null) {
        url.searchParams.set(k, sv);
      } else {
        console.warn(`[KPI] parámetro descartado (no serializable): ${k}=`, raw);
      }
    }
  }
  return url.toString();
}

export function defaultHeaders(): HeadersInit {
  const { orgId, apiKey } = resolveKpiCtx();
  return {
    "Content-Type": "application/json",
    "X-Org-Id": String(orgId),
    ...(apiKey ? { "x-api-key": String(apiKey) } : {}),
  };
}
