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
    // vaciamos listeners (se notifica una vez)
    while (listeners.length) {
      try { listeners.shift()?.(full); } catch {}
    }
  }
}

export function onCtx(fn: Cb) {
  const c = currentCtx();
  // si ya está listo, llamo sincrónicamente y devuelvo noop
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
      unsub();               // ← ahora existe seguro
      resolve(ctx);
    });

    const t = setTimeout(() => {
      if (done) return;
      done = true;
      unsub();
      reject(new Error("ctx timeout (no llegó EMBED_INIT)"));
    }, timeout);

    // por las dudas, polling suave
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

// ---- contexto (query + EMBED_INIT) ----
export function setupEmbedCtx() {
  if (ctxInstalled) return;
  ctxInstalled = true;

  // 1) Fallbacks por query (?org=, ?api=)
  try {
    const q = new URLSearchParams(location.search);
    const org = Number(q.get("org"));
    const api = q.get("api") || q.get("apiBase") || q.get("api_base");
    const initial: Partial<KpiCtx> = {};
    if (Number.isFinite(org) && org > 0) initial.orgId = org;
    if (api) initial.apiBase = normalizeBase(api);
    if (initial.orgId || initial.apiBase) mergeCtx(initial);
  } catch {}

  // 2) Handshake con el shell: EMBED_INIT { ctx }
  window.addEventListener("message", (e: MessageEvent) => {
    const d: any = e.data;
    if (!d || d.type !== "EMBED_INIT") return;
    (window as any).__EMBED_HOST_ORIGIN__ = e.origin || "*";
    if (d.ctx) {
      const incoming: Partial<KpiCtx> = { ...d.ctx };
      if (incoming.apiBase) incoming.apiBase = normalizeBase(incoming.apiBase);
      mergeCtx(incoming);
      try { (e.source as WindowProxy)?.postMessage({ type: "EMBED_READY" }, e.origin || "*"); } catch {}
    }
  });
}

// ---- auto altura ----
export function setupAutoHeight() {
  if (heightInstalled) return;
  heightInstalled = true;

  const isEmbedded = (() => { try { return window.top !== window.self; } catch { return true; } })();
  if (!isEmbedded) return;

  const measure = () => Math.max(
    document.documentElement.scrollHeight,
    document.body?.scrollHeight || 0,
    document.documentElement.offsetHeight,
    document.body?.offsetHeight || 0
  );

  const send = () => {
    const height = measure();
    const host = (window as any).__EMBED_HOST_ORIGIN__ || "*";
    parent.postMessage({ type: "EMBED_HEIGHT", height }, host);
  };

  window.addEventListener("message", (e: MessageEvent) => {
    if (e.data?.type === "EMBED_INIT") {
      (window as any).__EMBED_HOST_ORIGIN__ = e.origin || "*";
      send();
    }
  });

  const ro = new ResizeObserver(send);
  ro.observe(document.documentElement);

  const mo = new MutationObserver(send);
  mo.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });

  window.addEventListener("load", send);
  window.addEventListener("resize", send);

  const id = window.setInterval(send, 1000);
  window.addEventListener("beforeunload", () => clearInterval(id));
}

// ---- init ----
export function initEmbed() {
  setupEmbedCtx();
  setupAutoHeight();
}
