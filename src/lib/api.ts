// src/lib/api.ts

/* ========= Config dinámica (API + ORG + WS + (legacy) API Key para WS) ========= */

const ENV = (import.meta as any)?.env ?? {};

function trimSlash(s: string) { return String(s || "").replace(/\/+$/, ""); }
function isAbsHttpUrl(s: string) { return /^https?:\/\//i.test(String(s || "")); }
function isAbsWsUrl(s: string) { return /^wss?:\/\//i.test(String(s || "")); }

// LocalStorage helpers (seguros)
function lsGet(k: string, fb = "") { try { return typeof localStorage !== "undefined" ? localStorage.getItem(k) ?? fb : fb; } catch { return fb; } }
function lsSet(k: string, v: string) { try { if (typeof localStorage !== "undefined") localStorage.setItem(k, v); } catch {} }
function lsDel(k: string) { try { if (typeof localStorage !== "undefined") localStorage.removeItem(k); } catch {} }

const isDev = !!ENV.DEV;

// HTTP base (env > saved > default)
const ENV_API_HTTP = trimSlash(
  (ENV.VITE_API_URL as string | undefined) ??
  (ENV.VITE_API_HTTP_URL as string | undefined) ??
  ""
);

const RUNTIME_ORIGIN = typeof window !== "undefined" ? trimSlash(window.location.origin) : "";
const DEFAULT_API_HTTP = isDev ? "http://127.0.0.1:8000" : RUNTIME_ORIGIN;

let savedApi = lsGet("apiBase", "");
if (savedApi && !isAbsHttpUrl(savedApi)) savedApi = "";
if (savedApi && RUNTIME_ORIGIN && trimSlash(savedApi) === RUNTIME_ORIGIN) { lsDel("apiBase"); savedApi = ""; }

let API = trimSlash(ENV_API_HTTP || savedApi || DEFAULT_API_HTTP);

// (LEGACY) API key: ya no se envía por HTTP; se deja para WS si tu backend lo usa
const envKey = (ENV.VITE_API_KEY as string | undefined) ?? "";
const storedKey = lsGet("apiKey", "");
let API_KEY = (envKey || storedKey || (isDev ? "simulador123" : ""));

// ORG_ID (env > saved > default 1) — solo se manda cuando NO hay token
const envOrg = (ENV.VITE_ORG_ID as string | undefined) ?? "";
let ORG_ID = Number(lsGet("orgId", "")) || Number(envOrg) || 1;

// Timeout y retries
const HTTP_TIMEOUT_MS = Number(ENV.VITE_HTTP_TIMEOUT_MS ?? 45_000);
const HTTP_RETRIES = Math.max(0, Number(ENV.VITE_HTTP_RETRIES ?? 2));
const RETRY_BASE_MS = Math.max(50, Number(ENV.VITE_HTTP_RETRY_BASE_MS ?? 500));
const WAKE_ON_FAIL = String(ENV.VITE_HTTP_WAKE_ON_FAIL ?? "true").toLowerCase() !== "false";

// WS (env endpoint/base -> si no, derivar desde HTTP)
function wsFromHttpBase(httpBase: string) {
  const u = String(httpBase || "");
  if (u.startsWith("https://")) return "wss://" + u.slice(8);
  if (u.startsWith("http://"))  return "ws://"  + u.slice(7);
  if (typeof window !== "undefined") return (location.protocol === "https:" ? "wss://" : "ws://") + location.host;
  return "ws://127.0.0.1:8000";
}
const RAW_ENV_WS =
  (ENV.VITE_WS_URL as string | undefined) ??
  (ENV.VITE_API_WS_URL as string | undefined) ??
  "";
let WS_BASE_OR_ENDPOINT = trimSlash(RAW_ENV_WS || wsFromHttpBase(API));

/* ========= Auth (JWT) ========= */

// Token en LS
const TOKEN_KEY = "rdls_token";
function getToken() { return lsGet(TOKEN_KEY, ""); }
function setToken(t: string) { lsSet(TOKEN_KEY, t); }
function clearToken() { lsDel(TOKEN_KEY); }

// Decodificador mínimo de JWT (sin validar firma, solo UI)
function decodeJwt(t: string): any {
  try {
    const b = t.split(".")[1] ?? "";
    const padded = b.padEnd(b.length + (4 - (b.length % 4)) % 4, "=");
    return JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")));
  } catch { return {}; }
}

/* ========= Setters / Getters ========= */

export function setApiBase(url: string) {
  // Si vino por ENV, prevalece (no sobrescribimos en prod)
  if (ENV_API_HTTP) {
    API = trimSlash(ENV_API_HTTP);
    WS_BASE_OR_ENDPOINT = trimSlash(RAW_ENV_WS || wsFromHttpBase(API));
    return;
  }
  API = trimSlash(url || DEFAULT_API_HTTP) || DEFAULT_API_HTTP;
  WS_BASE_OR_ENDPOINT = trimSlash(RAW_ENV_WS || wsFromHttpBase(API));
  lsSet("apiBase", API);
}
export function getApiBase() { return API; }

export function setApiKey(key: string) {
  API_KEY = String(key || "");
  lsSet("apiKey", API_KEY);
}
export function getApiKey() { return API_KEY; }

export function setOrgId(id: number | string) {
  const n = Number(id);
  ORG_ID = Number.isFinite(n) && n > 0 ? n : 1;
  lsSet("orgId", String(ORG_ID));
}
export function getOrgId() { return ORG_ID; }

export function getWsBaseOrEndpoint() { return WS_BASE_OR_ENDPOINT; }

/** Devuelve la URL final del WS de telemetría con query params */
export function telemetryWsUrl(params: { apiKey?: string; deviceId?: string } = {}) {
  const apiKey = params.apiKey ?? API_KEY ?? "";
  const deviceId = params.deviceId ?? "web-ui";

  if (isAbsWsUrl(WS_BASE_OR_ENDPOINT)) {
    const url = new URL(WS_BASE_OR_ENDPOINT);
    if (!url.pathname || url.pathname === "/") {
      url.pathname = "/ws/telemetry";
    }
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("device_id", deviceId);
    return url.toString();
  }

  const base = WS_BASE_OR_ENDPOINT || wsFromHttpBase(API);
  const sep = base.endsWith("/") ? "" : "/";
  const u = new URL(`${base}${sep}ws/telemetry`);
  u.searchParams.set("api_key", apiKey);
  u.searchParams.set("device_id", deviceId);
  return u.toString();
}

export function debugConfig() {
  return {
    apiBase: API,
    wsUrl: telemetryWsUrl(),
    apiKeySet: !!API_KEY,
    orgId: ORG_ID,
    timeoutMs: HTTP_TIMEOUT_MS,
    retries: HTTP_RETRIES,
  };
}

export async function pingHealth(): Promise<{ ok: boolean }> {
  try {
    const r = await fetch(`${API}/health`, { method: "GET" });
    return { ok: r.ok };
  } catch {
    return { ok: false };
  }
}

/* ========= Headers comunes ========= */

function authHeaders(extra?: HeadersInit): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/json",
  };

  const token = getToken();
  if (token) {
    h.Authorization = `Bearer ${token}`;
  } else {
    // fallback legacy: si no hay login, dejamos pasar ORG para endpoints públicos
    h["X-Org-Id"] = String(ORG_ID);
  }

  if (extra) Object.assign(h, extra);
  return h;
}

/* ========= Helpers HTTP con retries ========= */

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504, 522, 524]);

function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)); }
function backoff(attempt: number) {
  const base = RETRY_BASE_MS * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * (RETRY_BASE_MS / 2));
  return base + jitter;
}

function isAbortOrNetwork(e: any) {
  const name = String(e?.name || "");
  const msg = String(e?.message || "");
  return name === "AbortError" || /aborted|network|Failed to fetch/i.test(msg);
}

function httpErrorMessage(r: Response, data: any) {
  const msg = data?.detail || data?.error;
  return msg ? String(msg) : `${r.status} ${r.statusText}`;
}

async function jrequest<T>(
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: any,
  extraHeaders?: HeadersInit
): Promise<T> {
  const url = `${API}${path}`;
  let lastErr: any = null;

  for (let attempt = 0; attempt <= HTTP_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);

    try {
      const r = await fetch(url, {
        method,
        headers: authHeaders(
          body != null ? { "Content-Type": "application/json", ...(extraHeaders ?? {}) } : extraHeaders
        ),
        body: body != null ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });

      if (!r.ok && RETRYABLE_STATUS.has(r.status) && attempt < HTTP_RETRIES) {
        lastErr = new Error(`${r.status} ${r.statusText}`);
        clearTimeout(timer);
        await sleep(backoff(attempt));
        continue;
      }

      if (r.status === 204) return {} as T;

      let data: any = {};
      try { data = await r.json(); }
      catch {
        const txt = await r.text().catch(() => "");
        data = txt ? { text: txt } : {};
      }

      if (!r.ok) {
        // si expira el token, limpiamos y dejamos que el caller maneje el error
        if (r.status === 401) {
          clearToken();
        }
        throw new Error(`${method} ${path} -> ${httpErrorMessage(r, data)}`);
      }
      return data as T;

    } catch (e: any) {
      lastErr = e;
      if (isAbortOrNetwork(e) && attempt < HTTP_RETRIES) {
        if (WAKE_ON_FAIL && attempt === 0) {
          try { await pingHealth(); } catch {}
        }
        clearTimeout(timer);
        await sleep(backoff(attempt));
        continue;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr ?? new Error(`${method} ${path} failed`);
}

async function jget<T>(path: string): Promise<T> { return jrequest<T>("GET", path); }
async function jpost<T>(path: string, body: any): Promise<T> { return jrequest<T>("POST", path, body); }
async function jput<T>(path: string, body: any): Promise<T> { return jrequest<T>("PUT", path, body); }

// === Soft-404 helpers (útiles cuando no hay lecturas) ===
function isNotFoundErr(e: any) {
  const m = String(e?.message || "");
  return m.includes(" 404 ") || /Not Found/i.test(m);
}
async function jgetOr<T>(path: string, fallback: () => T): Promise<T> {
  try { return await jget<T>(path); }
  catch (e) { if (isNotFoundErr(e)) return fallback(); throw e; }
}

// Querystring limpio (omite undefined/null)
function qs(params?: Record<string, any>) {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

// Normaliza "CMD_START" -> "START"
export type PumpCmd = "START" | "STOP" | "AUTO" | "MAN" | "SPEED";
export type PumpCmdStatus = "queued" | "sent" | "acked" | "failed" | "expired";
export type QueuePumpCmdIn = { cmd: PumpCmd | `CMD_${PumpCmd}`; user: string; speed_pct?: number };
export type PumpCommandRow = {
  id: number;
  pump_id: number;
  cmd: PumpCmd;
  status: PumpCmdStatus;
  payload: any | null;
  ts_created: string;
  ts_sent?: string | null;
  ts_acked?: string | null;
  error?: string | null;
};

function normalizeCmd(cmd: QueuePumpCmdIn["cmd"]): PumpCmd {
  const raw = (cmd || "").toString();
  const c = raw.startsWith("CMD_") ? raw.slice(4) : raw;
  const U = c.toUpperCase();
  if (U === "START" || U === "STOP" || U === "AUTO" || U === "MAN" || U === "SPEED") return U as PumpCmd;
  throw new Error(`cmd inválido: ${raw}`);
}

/* ========= Tipos de dominio ========= */

export type Tank = {
  id: number;
  name: string;
  capacity_liters: number | null;
  material?: string | null;
  fluid?: string | null;
  install_year?: number | null;
  location_text?: string | null;
};

export type TankLatest = {
  id: number;
  ts: string;
  level_percent: number | null;
  volume_l: number | null;
  temperature_c: number | null;
  extra: any | null;
  reading_id?: number;
};

export type TankHistoryPoint = {
  ts: string;
  level_percent: number | null;
  volume_l: number | null;
  temperature_c: number | null;
};

export type Pump = {
  id: number;
  name: string;
  model: string | null;
  max_flow_lpm: number | null;
  drive_type?: "direct" | "soft" | "vfd" | null;
  control?: { manual_lockout?: boolean | null } | null;
};

export type PumpLatest = {
  id: number;
  ts: string;
  is_on: boolean | null;
  flow_lpm: number | null;
  pressure_bar: number | null;
  voltage_v: number | null;
  current_a: number | null;
  control_mode?: "auto" | "manual" | null;
  manual_lockout?: boolean | null;
  extra: any | null;
  reading_id?: number;
};

export type PumpHistoryPoint = {
  ts: string;
  is_on: boolean | null;
  flow_lpm: number | null;
  pressure_bar: number | null;
  voltage_v: number | null;
  current_a: number | null;
};

/* ---- Config de tanques ---- */
export type TankWithConfig = {
  id: number;
  name: string;
  capacity_liters: number | null;
  low_pct: number | null;
  low_low_pct: number | null;
  high_pct: number | null;
  high_high_pct: number | null;
  material?: string | null;
  fluid?: string | null;
  install_year?: number | null;
  location_text?: string | null;
};
export type TankConfigIn = {
  low_pct: number;
  low_low_pct: number;
  high_pct: number;
  high_high_pct: number;
};

/* ---- Config de bombas ---- */
export type PumpWithConfig = {
  id: number;
  name: string;
  model: string | null;
  max_flow_lpm: number | null;
  drive_type: "direct" | "soft" | "vfd" | null;
  remote_enabled: boolean | null;
  vfd_min_speed_pct: number | null;
  vfd_max_speed_pct: number | null;
  vfd_default_speed_pct: number | null;
  // opcional: si el front agrupa por ubicación
  location_id?: number | null;
  location_code?: string | null;
  location_name?: string | null;
};
export type PumpConfigIn = {
  remote_enabled?: boolean | null;
  drive_type?: "direct" | "soft" | "vfd" | null;
  vfd_min_speed_pct?: number | null;
  vfd_max_speed_pct?: number | null;
  vfd_default_speed_pct?: number | null;
};

/* ---- Alarmas ---- */
export type Alarm = {
  id: number;
  asset_type: "tank" | "pump";
  asset_id: number;
  code: "LOW_LOW" | "LOW" | "HIGH" | "HIGH_HIGH" | "SENSOR_FAIL";
  severity: "critical" | "warning" | "info";
  message: string;
  ts_raised: string;
  ts_cleared: string | null;
  ack_by: string | null;
  ts_ack: string | null;
  is_active: boolean;
};
export type AckIn = { user: string; note?: string | null };

/* ---- Auditoría ---- */
export type AuditEvent = {
  ts: string;
  asset_type: "tank" | "pump";
  asset_id: number;
  code: "LOW_LOW" | "LOW" | "HIGH" | "HIGH_HIGH" | "SENSOR_FAIL";
  severity: "critical" | "warning" | "info";
  state: "RAISED" | "ACKED" | "CLEARED";
  user?: string;
  action?: string;
  asset?: string;
  details?: any;
};

/* ---- Presencia (WS backend) ---- */
export type PresenceStatus = {
  device_id: string;
  online: boolean;
  last_seen: string | null;
};

/* ========= Utilidades de normalización ========= */

const num = (v: unknown) =>
  v === null || v === undefined || v === "" ? null : Number(v);

/* ========= Endpoints ========= */

export const api = {
  /* ---- Tanks ---- */
  listTanks: () => jget<Tank[]>("/tanks"),

  // tolerante a id indefinido y a has_data=false
  tankLatest: async (id?: number): Promise<TankLatest | null> => {
    if (id == null || !Number.isFinite(id)) return null;

    const fallback: TankLatest = {
      id,
      ts: new Date(0).toISOString(),
      level_percent: null,
      volume_l: null,
      temperature_c: null,
      extra: null,
      reading_id: undefined,
    };

    const raw = await jgetOr<any>(`/tanks/${id}/latest`, () => null);
    if (!raw || raw.has_data === false) return fallback;

    // Si falta volume_l pero viene capacity_m3 + level_percent, estimamos
    let volume_l: number | null = num(raw?.volume_l);
    const level_pct = num(raw?.level_percent);
    const capacity_m3 = num(raw?.capacity_m3);
    if ((volume_l === null || Number.isNaN(volume_l)) && capacity_m3 != null && level_pct != null) {
      volume_l = Math.round(capacity_m3 * 1000 * (level_pct / 100));
    }

    const out: TankLatest = {
      id: Number(raw?.tank_id ?? id),
      ts: String(raw?.ts ?? fallback.ts),
      level_percent: level_pct,
      volume_l: volume_l,
      temperature_c: num(raw?.temperature_c),
      extra: raw?.raw_json ?? null,
      reading_id: raw?.id ?? undefined,
    };
    return out;
  },

  tankHistory: async (id: number, limit = 100) =>
    await jgetOr<TankHistoryPoint[]>(`/tanks/${id}/history${qs({ limit })}`, () => []),

  /* ---- Config Tanks ---- */
  listTanksWithConfig: async (): Promise<TankWithConfig[]> => {
    const raw = await jgetOr<any[]>("/tanks/config", () => []);
    return raw.map((r) => {
      const id = Number(r.id ?? r.tank_id);
      const name = String(r.name ?? r.tank_name ?? `Tank ${id}`);
      let capacity_liters: number | null = null;

      if (r.capacity_liters != null) {
        capacity_liters = num(r.capacity_liters);
      } else if (r.capacity_m3 != null) {
        const cm3 = num(r.capacity_m3);
        capacity_liters = cm3 != null ? Math.round(cm3 * 1000) : null;
      }

      return {
        id,
        name,
        capacity_liters,
        low_pct: num(r.low_pct),
        low_low_pct: num(r.low_low_pct),
        high_pct: num(r.high_pct),
        high_high_pct: num(r.high_high_pct),
        material: r.material ?? null,
        fluid: r.fluid ?? null,
        install_year: r.install_year ?? null,
        // opcional: mostramos el nombre de location si está
        location_text: r.location_name ?? null,
      } as TankWithConfig;
    });
  },

  saveTankConfig: async (tankId: number, cfg: TankConfigIn) => {
    try {
      return await jput<{ ok: true; config: any }>(`/tanks/${tankId}/config`, cfg);
    } catch (e: any) {
      if (String(e?.message || "").includes("405")) {
        return await jpost<{ ok: true; config: any }>(`/tanks/${tankId}/config`, cfg);
      }
      throw e;
    }
  },

  /* ---- Pumps ---- */
  listPumps: () => jget<Pump[]>("/pumps"),

  // tolerante a 404 y a has_data=false
  pumpLatest: async (id: number) => {
    const fallback: PumpLatest = {
      id, ts: new Date(0).toISOString(),
      is_on: null, flow_lpm: null, pressure_bar: null, voltage_v: null, current_a: null,
      control_mode: null, manual_lockout: null, extra: null, reading_id: undefined,
    };
    const raw = await jgetOr<any>(`/pumps/${id}/latest`, () => null);
    if (!raw || raw.has_data === false) return fallback;

    return {
      id: Number(raw?.pump_id ?? id),
      ts: String(raw?.ts ?? fallback.ts),
      is_on: typeof raw?.is_on === "boolean" ? raw.is_on : (raw?.is_on == null ? null : !!raw.is_on),
      flow_lpm: num(raw?.flow_lpm),
      pressure_bar: num(raw?.pressure_bar),
      voltage_v: num(raw?.voltage_v),
      current_a: num(raw?.current_a),
      control_mode: raw?.control_mode ?? null,
      manual_lockout: raw?.manual_lockout ?? null,
      extra: raw?.raw_json ?? null,
      reading_id: raw?.id ?? undefined,
    } as PumpLatest;
  },

  pumpHistory: async (id: number, limit = 100) =>
    await jgetOr<PumpHistoryPoint[]>(`/pumps/${id}/history${qs({ limit })}`, () => []),

  /* ---- Config Pumps ---- */
  listPumpsWithConfig: async () =>
    await jgetOr<PumpWithConfig[]>("/pumps/config", () => []),

  savePumpConfig: async (pumpId: number, cfg: PumpConfigIn) => {
    try {
      return await jput<{ ok: true; config: any }>(`/pumps/${pumpId}/config`, cfg);
    } catch (e: any) {
      if (String(e?.message || "").includes("405")) {
        return await jpost<{ ok: true; config: any }>(`/pumps/${pumpId}/config`, cfg);
      }
      throw e;
    }
  },

  /* ---- Comandos bomba ---- */
  queuePumpCommand: (pumpId: number, body: QueuePumpCmdIn) => {
    const clean: any = { cmd: normalizeCmd(body.cmd), user: body.user || "operador" };
    if (clean.cmd === "SPEED" && typeof body.speed_pct === "number") clean.speed_pct = body.speed_pct;
    return jpost<PumpCommandRow>(`/pumps/${pumpId}/command`, clean);
  },
  startPump: (pumpId: number, user = "operador") => api.queuePumpCommand(pumpId, { cmd: "START", user }),
  stopPump:  (pumpId: number, user = "operador") => api.queuePumpCommand(pumpId, { cmd: "STOP",  user }),
  autoPump:  (pumpId: number, user = "operador") => api.queuePumpCommand(pumpId, { cmd: "AUTO",  user }),
  manPump:   (pumpId: number, user = "operador") => api.queuePumpCommand(pumpId, { cmd: "MAN",   user }),
  speedPump: (pumpId: number, speed_pct: number, user = "operador") =>
    api.queuePumpCommand(pumpId, { cmd: "SPEED", user, speed_pct }),

  listPumpCommands: (pumpId: number, status?: PumpCmdStatus) =>
    jget<PumpCommandRow[]>(`/pumps/${pumpId}/commands${qs({ status })}`),

  updatePumpCommandStatus: (
    pumpId: number, cmdId: number, status: Exclude<PumpCmdStatus, "queued">, error?: string
  ) => jpost<{ id: number; status: PumpCmdStatus }>(
      `/pumps/${pumpId}/commands/${cmdId}/status`, { status, error }
    ),

  /* ---- Alarmas ---- */
  listAlarms: (active: boolean | null = true) =>
    jget<Alarm[]>(`/alarms${active === null ? "" : `?active=${active}`}`),
  ackAlarm: (alarmId: number, body: AckIn) =>
    jpost<{ ok: true; alarm?: Alarm }>(`/alarms/${alarmId}/ack`, body),

  /* ---- Auditoría ---- */
  auditList: (params?: {
    asset_type?: "tank" | "pump";
    asset_id?: number;
    code?: "LOW_LOW" | "LOW" | "HIGH" | "HIGH_HIGH" | "SENSOR_FAIL";
    state?: "RAISED" | "ACKED" | "CLEARED";
    since?: string;
    until?: string;
    limit?: number;
  }) => jget<AuditEvent[]>(`/audit${qs(params)}`),

  /* ---- Presencia ---- */
  presence: async (deviceId: string) =>
    await jgetOr<PresenceStatus>(`/presence/${encodeURIComponent(deviceId)}`, () => ({
      device_id: deviceId, online: false, last_seen: null,
    })),
  presenceAll: () => jget<Record<string, PresenceStatus>>(`/presence`),
};


// --- Tipos para infra/locations ---
export type Location = {
  id: string;
  name: string;
  counts: { tank: number; pump: number; valve: number; manifold: number };
};

export type LocationSummary = {
  location: string;
  counts: { tank: number; pump: number; valve: number; manifold: number };
  telemetry: { pumps_with_latest: number; tanks_with_latest: number };
  kpis: { pumps_uptime_ratio_30d: number | null; tanks_avg_fill_pct_30d: number | null; pumps_kwh_30d: number | null };
};

// --- Endpoints de infraestructura ---
export const infra = {
  graphNodes: () => jget<any[]>('/infra/graph/nodes'),
  graphEdges: () => jget<any[]>('/infra/graph/edges'),
  locations: () => jget<Location[]>('/infra/locations'),
  locAssets:  (id: string) => jget<any[]>(`/infra/locations/${encodeURIComponent(id)}/assets`),
  locSummary: (id: string) => jget<LocationSummary>(`/infra/locations/${encodeURIComponent(id)}/summary`),
};

// --- NUEVO: tipos backend actuales (IDs numéricos) ---
export type InfraAssetType = "tank" | "pump" | "valve" | "manifold";
export type InfraLocation = { id: number; code: string; name: string };
export type InfraAssetItem = { id: number; name?: string; code?: string };
export type InfraAssetGroup = { type: InfraAssetType; items: InfraAssetItem[] };
export type InfraSummary = {
  location_id: number; location_code: string; location_name: string;
  assets_total: number; tanks_count: number; pumps_count: number; valves_count: number; manifolds_count: number;
  alarms_active: number; alarms_critical_active: number;
  pump_readings_30d?: number | null; tank_readings_30d?: number | null;
  pumps_last_seen?: string | null;    tanks_last_seen?: string | null;
};
export type InfraTree = { location: InfraLocation; summary: InfraSummary; assets: InfraAssetGroup[] };

// --- NUEVO: endpoints numerados ---
export const infra2 = {
  locations: () => jget<InfraLocation[]>('/infra/locations'),
  locTree:   (id: number) => jget<InfraTree>(`/infra/locations/${id}/tree`),
  locAssets: (id: number) => jget<InfraAssetGroup[]>(`/infra/locations/${id}/assets`),
};

// --- NUEVO: helper para mapa asset -> location_id ---
export async function fetchAssetLocationMap(): Promise<Map<string, number>> {
  const locs = await infra2.locations();
  const pairs: [string, number][] = [];
  await Promise.all(
    locs.map(async (l) => {
      const tree = await infra2.locTree(l.id);
      tree.assets.forEach(g => g.items.forEach(a => {
        pairs.push([`${g.type}:${a.id}`, l.id]);
      }));
    })
  );
  return new Map(pairs);
}

/* ========= Auth client (login/logout) ========= */

export const auth = {
  async login(username: string, password: string, org_id: number) {
    // usamos fetch directo para no enviar headers de auth si aún no hay token
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ username, password, org_id }),
    });

    let data: any = null;
    try { data = await res.json(); } catch { /* noop */ }

    if (!res.ok) {
      const detail = data?.detail || res.statusText;
      if (res.status === 401) throw new Error("Usuario o contraseña incorrectos");
      if (res.status === 403) throw new Error("No tenés acceso a esa organización");
      throw new Error(`Login falló (${res.status}): ${detail}`);
    }

    const token: string = data.access_token;
    setToken(token);

    // Si quisieras sincronizar ORG_ID legacy cuando no usemos token:
    // setOrgId(Number(decodeJwt(token)?.org_id ?? org_id));

    return { token, exp: data.exp, payload: decodeJwt(token) };
  },

  logout() { clearToken(); },

  token: () => getToken(),
  isAuthed: () => !!getToken(),
  decode: () => decodeJwt(getToken()),
};
