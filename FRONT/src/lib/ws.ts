// src/lib/ws.ts

/**
 * WebSocket de telemetría (UI) con:
 * - api_key y device_id por querystring (los navegadores no envían headers custom en WS).
 * - Reconexión con backoff exponencial.
 * - Heartbeat app-nivel periódico para presencia online/offline.
 *
 * Config por .env (opcional):
 *   VITE_WS_URL            (p.ej.: ws://127.0.0.1:8000/ws/telemetry)
 *   VITE_API_URL           (fallback REST si no hay VITE_WS_URL)
 *   VITE_API_KEY           (api key por defecto; se puede sobrescribir con setWsApiKey)
 *   VITE_WS_HEARTBEAT_MS   (default 10000 ms)
 *   VITE_WS_DEBUG          ("true"/"false", default false)
 *
 * Persistencia en localStorage:
 *   apiKey         (compartida con api.ts)
 *   wsDeviceId     (ID lógico de esta vista/cliente; default "web-ui")
 */

import { getApiBase } from "./api";

export type TelemetryMsg =
  | { type: "status"; payload?: any; online?: boolean; ts?: number }
  | { type: "heartbeat"; device_id?: string; rssi?: number; uptime_s?: number; ts?: number }
  | { type: "event"; device_id?: string; kind: string; ts?: number; [k: string]: any }
  | { type: "message"; data?: any; ts?: number }
  | { type: string; [k: string]: any }; // fallback

// ===== Config runtime (con defaults desde .env / localStorage) =====
const env = ((import.meta as any)?.env ?? {}) as Record<string, any>;

let WS_PATH = "/ws/telemetry";

// coerción segura desde strings de .env
const toBool = (v: any, def = false) =>
  typeof v === "string" ? v.toLowerCase() === "true" : v ?? def;

const toInt = (v: any, def: number) => {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : def;
};

let WS_HEARTBEAT_MS = toInt(env.VITE_WS_HEARTBEAT_MS, 10_000);
let WS_DEBUG = toBool(env.VITE_WS_DEBUG, false);

// Fuente explícita de WS si está definida
const DEFAULT_WS_URL = (env.VITE_WS_URL as string | undefined)?.trim() || undefined;

// API key y device id (comparten localStorage con api.ts)
let API_KEY =
  (env.VITE_API_KEY as string | undefined) ??
  (typeof localStorage !== "undefined" ? localStorage.getItem("apiKey") ?? "" : "");

let DEVICE_ID =
  typeof localStorage !== "undefined"
    ? localStorage.getItem("wsDeviceId") ?? "web-ui"
    : "web-ui";

// ===== Getters/Setters para configurar en runtime =====
export function setWsApiKey(key: string) {
  API_KEY = String(key || "");
  try {
    localStorage.setItem("apiKey", API_KEY);
  } catch {}
}

export function setWsDeviceId(id: string) {
  DEVICE_ID = String(id || "web-ui");
  try {
    localStorage.setItem("wsDeviceId", DEVICE_ID);
  } catch {}
}

export function setWsPath(path: string) {
  WS_PATH = path?.startsWith("/") ? path : `/${path || "ws/telemetry"}`;
}

export function setWsHeartbeat(ms: number) {
  const n = Number(ms);
  if (Number.isFinite(n) && n >= 0) WS_HEARTBEAT_MS = n;
}

export function setWsDebug(v: boolean) {
  WS_DEBUG = !!v;
}

// ===== Construcción de URL de WS con api_key y device_id en querystring =====
function pickWsUrl(path = WS_PATH) {
  // 1) Si hay VITE_WS_URL explícita, úsala tal cual
  if (DEFAULT_WS_URL) {
    const u = new URL(DEFAULT_WS_URL);
    u.searchParams.set("api_key", API_KEY || "");
    u.searchParams.set("device_id", DEVICE_ID || "web-ui");
    return u.toString();
  }

  // 2) Sin VITE_WS_URL: derivar SIEMPRE desde la base del REST (getApiBase),
  //    NO desde window.location.origin (evita ws://localhost:5173/...)
  const apiBase = (getApiBase() || "http://127.0.0.1:8000").replace(/\/+$/, "");
  const wsBase = apiBase.replace(/^http(s?):/i, (_m, s1) => (s1 ? "wss:" : "ws:"));

  const cleanPath = path?.startsWith("/") ? path : `/${path || "ws/telemetry"}`;
  const url = new URL(`${wsBase}${cleanPath}`);
  url.searchParams.set("api_key", API_KEY || "");
  url.searchParams.set("device_id", DEVICE_ID || "web-ui");
  return url.toString();
}

export function getWsUrlPreview() {
  try {
    return pickWsUrl();
  } catch {
    return "";
  }
}

// ===== Núcleo de conexión =====
export function openTelemetry(
  onMessage: (m: TelemetryMsg) => void,
  opts?: { onOpen?: () => void; onClose?: (e?: CloseEvent) => void; debug?: boolean }
) {
  let ws: WebSocket | null = null;
  let closed = false;
  let backoff = 1000;
  const MAX = 10_000;
  const debug = !!(opts?.debug ?? WS_DEBUG);
  const url = pickWsUrl();

  let heartbeatTimer: number | null = null;

  function log(...a: any[]) {
    if (debug && typeof console !== "undefined") console.log("[WS]", ...a);
  }

  function clearHeartbeat() {
    if (heartbeatTimer != null) {
      clearInterval(heartbeatTimer as any);
      heartbeatTimer = null;
    }
  }

  function startHeartbeat() {
    clearHeartbeat();
    if (!WS_HEARTBEAT_MS || WS_HEARTBEAT_MS <= 0) return;
    heartbeatTimer = setInterval(() => {
      try {
        if (ws && ws.readyState === WebSocket.OPEN) {
          const beat = JSON.stringify({
            type: "heartbeat",
            device_id: DEVICE_ID,
            ts: Date.now(),
          });
          ws.send(beat);
        }
      } catch {
        // ignore
      }
    }, WS_HEARTBEAT_MS) as unknown as number;
  }

  function connect() {
    if (closed) return;
    log("connect", url);

    try {
      ws = new WebSocket(url);
    } catch (e) {
      log("constructor error", e);
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, MAX);
      return;
    }

    ws.onopen = () => {
      log("open");
      backoff = 1000;
      opts?.onOpen?.();

      // hello inicial para marcar presencia inmediata en el servidor
      try {
        ws?.send(JSON.stringify({ type: "hello", device_id: DEVICE_ID, ts: Date.now() }));
      } catch {}

      // Avisar online instantáneo a la UI
      try {
        onMessage({ type: "status", online: true, ts: Date.now() } as any);
      } catch {}

      startHeartbeat();
    };

    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data);
        onMessage(m);
      } catch {
        // Mensaje no-JSON: reenviarlo como “message” genérico (sirve como keepalive)
        onMessage({ type: "message", data: ev.data, ts: Date.now() });
      }
    };

    ws.onclose = (ev) => {
      log("close", ev.code, ev.reason);
      clearHeartbeat();

      // Avisar offline instantáneo a la UI
      try {
        onMessage({ type: "status", online: false, ts: Date.now() } as any);
      } catch {}

      opts?.onClose?.(ev);

      if (!closed) {
        setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, MAX);
      }
    };

    ws.onerror = (ev) => {
      log("error", ev);
      try {
        ws?.close();
      } catch {}
    };
  }

  connect();

  return {
    close() {
      closed = true;
      clearHeartbeat();
      try {
        ws?.close();
      } catch {}
    },
  };
}

/* ===== Adaptadores para tu ScadaApp ===== */
let _online = false;
let _lastMsgTs = 0;
const _listeners = new Set<(m: TelemetryMsg) => void>();
let _controller: { close: () => void } | null = null;

export function getLastMsgTs() {
  return _lastMsgTs;
}

export function connectTelemetryWS(opts?: { debug?: boolean }) {
  if (_controller) return _controller; // idempotente
  const controller = openTelemetry((m) => {
    // timestamp del último mensaje (incluye status sintético/heartbeat/eventos)
    _lastMsgTs = Date.now();

    // normalizamos “status” → online
    if (m?.type === "status") {
      const online = !!(m as any).online || !!(m as any)?.payload?.online;
      _online = online;
    } else if (m?.type === "heartbeat") {
      // cualquier heartbeat recibido desde el server implica online
      _online = true;
    }

    // fan-out a listeners
    _listeners.forEach((fn) => {
      try {
        fn(m);
      } catch {}
    });
  }, opts);
  _controller = controller;
  return controller;
}

export function onWS(fn: (m: TelemetryMsg) => void) {
  _listeners.add(fn);
  // Al suscribirse, emitir inmediatamente el estado actual (evita perder el primer status)
  try {
    fn({ type: "status", online: _online, ts: Date.now() } as any);
  } catch {}
  return () => _listeners.delete(fn);
}

export function isWSOnline() {
  return _online;
}
