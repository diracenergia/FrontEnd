// kpi/src/embed.ts
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
    __EMBED_HOST_ORIGIN__?: string;
  }
}

// ==== Debug ====
const DEBUG = (localStorage.getItem("embed:debug") ?? "0") !== "0";
const log  = (...a: any[]) => DEBUG && console.log("[kpi][embed]", ...a);
const warn = (...a: any[]) => DEBUG && console.warn("[kpi][embed]", ...a);
const err  = (...a: any[]) => DEBUG && console.error("[kpi][embed]", ...a);

let heightInstalled = false;
let ctxInstalled = false;

// Mini bus para "ctx listo"
type Cb = (ctx: KpiCtx) => void;
const listeners: Cb[] = [];

function currentCtx(): Partial<KpiCtx> {
  const w = window as any;
  return w.__KPI_CTX__ || w.__APP_CTX__ || {};
}

function notifyIfReady() {
  const c = currentCtx();
  if (c && c.orgId && c.apiBase) {
    const full = c as KpiCtx;
    while (listeners.length) {
      try { listeners.shift()?.(full); } catch {}
    }
  }
}

export function onCtx(fn: Cb) {
  const c = currentCtx();
  if (c && c.orgId && c.apiBase) {
    fn(c as KpiCtx);
    return () => {};
  }
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

export function waitForCtx(opts: { timeout?: number; needApiBase?: boolean } = {}) {
  const { timeout = 3000, needApiBase = true } = opts;
  return new Promise<KpiCtx>((resolve, reject) => {
    let done = false;

    const tryResolve = () => {
      if (done) return true;
      const c = currentCtx();
      const ok = c && c.orgId && (!needApiBase || !!c.apiBase);
      if (ok) {
        done = true;
        resolve(c as KpiCtx);
        return true;
      }
      return false;
    };

    if (tryResolve()) return;

    const unsub = onCtx((ctx) => {
      if (done) return;
      done = true;
      unsub();
      resolve(ctx);
    });

    const t = setTimeout(() => {
      if (done) return;
      done = true;
      unsub();
      reject(new Error("ctx timeout (no llegó EMBED_INIT)"));
    }, timeout);

    const tick = () => {
      if (done) return;
      if (tryResolve()) {
        clearTimeout(t);
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

// ---- utils ----
function isAbsHttpUrl(s?: string) { return /^https?:\/\//i.test(String(s || "")); }
function normalizeBase(b?: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  let base = String(b || "").trim();
  if (!base) base = origin;
  if (!isAbsHttpUrl(base)) {
    try { base = new URL(base, origin).toString(); } catch { base = origin; }
  }
  return base.replace(/\/+$/,"");
}
function mergeCtx(patch?: Partial<KpiCtx>) {
  if (!patch) return;
  const w = window as any;
  w.__APP_CTX__ = { ...(w.__APP_CTX__ || {}), ...patch };
  w.__KPI_CTX__ = { ...(w.__KPI_CTX__ || {}), ...patch };
  notifyIfReady();
}

// ---- helpers handshake ----
function setHostOrigin(origin: string) {
  (window as any).__EMBED_HOST_ORIGIN__ = origin || "*";
}
function getHostOrigin() {
  return (window as any).__EMBED_HOST_ORIGIN__ || "*";
}
function sendReady(tag = "ready") {
  const host = getHostOrigin();
  try {
    parent.postMessage({ type: "EMBED_READY", tag }, host);
    log("sent EMBED_READY →", host, { tag });
  } catch (e) {
    warn("EMBED_READY failed", e);
  }
}

// ---- contexto (query + EMBED_INIT) ----
export function setupEmbedCtx() {
  if (ctxInstalled) return;
  ctxInstalled = true;

  // 0) instalamos listeners muy temprano
  window.addEventListener("message", (e: MessageEvent) => {
    const d: any = e.data;
    if (!d || typeof d !== "object") return;

    if (d.type === "EMBED_INIT") {
      setHostOrigin(e.origin || "*");
      log("EMBED_INIT from", e.origin, d.ctx);

      if (d.ctx) {
        const incoming: Partial<KpiCtx> = { ...d.ctx };
        if (incoming.apiBase) incoming.apiBase = normalizeBase(incoming.apiBase);
        mergeCtx(incoming);
      }
      // contestamos READY siempre que llega INIT
      sendReady("on-init");
    }
  });

  // 1) Fallbacks por query (?org=, ?api=)
  try {
    const q = new URLSearchParams(location.search);
    const org = Number(q.get("org"));
    const api = q.get("api") || q.get("apiBase") || q.get("api_base");
    const initial: Partial<KpiCtx> = {};
    if (Number.isFinite(org) && org > 0) initial.orgId = org;
    if (api) initial.apiBase = normalizeBase(api);
    if (initial.orgId || initial.apiBase) {
      log("merge ctx from query →", initial);
      mergeCtx(initial);
    }
  } catch {}

  // 2) Avisar proactivamente que estoy listo (varias veces por si el host instaló tarde)
  //    El host también re-pinguea, pero esto acelera.
  setHostOrigin("*");

  // microtask inmediato
  queueMicrotask(() => sendReady("microtask"));
  // por si el bundle es grande:
  setTimeout(() => sendReady("t+0"), 0);
  // tras DOM listo
  if (document.readyState === "complete" || document.readyState === "interactive") {
    sendReady("dom-ready");
  } else {
    window.addEventListener("DOMContentLoaded", () => sendReady("DOMContentLoaded"), { once: true });
  }
  // y después de load (suele mover altura)
  window.addEventListener("load", () => sendReady("window-load"), { once: true });
}

// ---- auto altura ----
export function setupAutoHeight() {
  if (heightInstalled) return;
  heightInstalled = true;

  const isEmbedded = (() => { try { return window.top !== window.self; } catch { return true; } })();
  if (!isEmbedded) {
    log("skip autoHeight (not embedded)");
    return;
  }

  const measure = () => Math.max(
    document.documentElement.scrollHeight,
    document.body?.scrollHeight || 0,
    document.documentElement.offsetHeight,
    document.body?.offsetHeight || 0,
    (document.scrollingElement as HTMLElement | null)?.scrollHeight || 0
  );

  const send = (src = "tick") => {
    const height = measure();
    const host = getHostOrigin();
    parent.postMessage({ type: "EMBED_HEIGHT", height }, host);
    log("sent EMBED_HEIGHT", height, "from", src);
  };

  window.addEventListener("message", (e: MessageEvent) => {
    if (e.data?.type === "EMBED_INIT") {
      setHostOrigin(e.origin || "*");
      send("on-init");
    }
  });

  const ro = new ResizeObserver(() => send("resize-observer"));
  ro.observe(document.documentElement);

  const mo = new MutationObserver(() => send("mutation-observer"));
  mo.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });

  window.addEventListener("load", () => send("window-load"));
  window.addEventListener("resize", () => send("window-resize"));
  (document as any).fonts?.ready?.then?.(() => send("fonts-ready"));

  const id = window.setInterval(() => send("interval-1s"), 1000);
  window.addEventListener("beforeunload", () => clearInterval(id));
}

// ---- init ----
export function initEmbed() {
  try {
    setupEmbedCtx();
    setupAutoHeight();
    log("initEmbed done");
  } catch (e) {
    err("initEmbed failed", e);
  }
}
