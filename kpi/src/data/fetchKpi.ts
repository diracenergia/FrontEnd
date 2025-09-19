// kpi/src/data/fetchKpi.ts
// Obtiene los KPIs reales desde tu backend (Render) con headers multi-tenant.
// Incluye reintentos con backoff para mitigar el "cold start" de Render.

import type { KpiPayload } from "@/components/kpi/types";

export type WindowRange = "24h" | "7d" | "30d";

type RetryOpts = {
  retries?: number;      // cantidad de reintentos (default 5)
  baseDelayMs?: number;  // demora base del backoff (default 500ms)
  signal?: AbortSignal;  // cancelación por si cambia la ubicación/ventana
};

function joinUrl(base: string, path: string) {
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit & { signal?: AbortSignal },
  { retries = 5, baseDelayMs = 500 }: RetryOpts = {}
): Promise<Response> {
  let lastErr: any;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res;
    } catch (e: any) {
      // Si fue cancelado, no seguir reintentando
      if (e?.name === "AbortError") throw e;
      lastErr = e;

      if (attempt === retries) break;
      const delay = baseDelayMs * Math.pow(2, attempt); // 0.5s, 1s, 2s, 4s...
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/**
 * Llama al endpoint /kpi/overview con headers multi-tenant.
 *
 * @param baseUrl URL base del backend (ej. https://backend-v85n.onrender.com)
 * @param locId   ID de la ubicación (location)
 * @param window  Ventana temporal ("24h" | "7d" | "30d")
 * @param orgId   ID de la organización (cabecera X-Org-Id)
 * @param userId  (opcional) ID del usuario (cabecera X-User-Id)
 * @param opts    (opcional) opciones de retry/abort
 */
export async function fetchKpi(
  baseUrl: string,
  locId: number,
  window: WindowRange = "7d",
  orgId: number,
  userId?: number,
  opts: RetryOpts = {}
): Promise<KpiPayload> {
  const url = joinUrl(
    baseUrl,
    `/kpi/overview?loc_id=${encodeURIComponent(locId)}&window=${encodeURIComponent(
      window
    )}`
  );

  const headers: HeadersInit = {
    Accept: "application/json",
    "X-Org-Id": String(orgId),
  };
  if (userId != null) headers["X-User-Id"] = String(userId);

  const res = await fetchWithRetry(
    url,
    {
      method: "GET",
      headers,
      signal: opts.signal,
    },
    { retries: opts.retries ?? 5, baseDelayMs: opts.baseDelayMs ?? 500 }
  );

  return (await res.json()) as KpiPayload;
}
