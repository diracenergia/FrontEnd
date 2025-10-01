// src/loader.ts

type ModuleApp = { name: string; type: 'module';       url: string; mount: string; props?: any };
type WCApp     = { name: string; type: 'webcomponent'; url: string; tag: string; mount?: string; props?: any };
type IFrameApp = { name: string; type: 'iframe';       url: string; mount: string; allow?: string; sandbox?: string; fixedHeight?: string };
type App = ModuleApp | WCApp | IFrameApp;

export type AppCtx = {
  orgId: number;
  apiBase: string;
  apiKey?: string;
  authInQuery?: boolean;
  wsBase?: string;
};

type LoadAppsOpts = {
  ctx?: Partial<AppCtx>;
  shellApi?: Record<string, any>;
};

// ===== Debug =====
const DEBUG = (localStorage.getItem("embed:debug") ?? "0") !== "0";
const dlog  = (...a: any[]) => { if (DEBUG) console.log("[embed]", ...a); };
const dwarn = (...a: any[]) => { if (DEBUG) console.warn("[embed]", ...a); };
const derr  = (...a: any[]) => { if (DEBUG) console.error("[embed]", ...a); };

// Mapeos
const frameByWindow = new Map<Window, HTMLIFrameElement>();
const originByFrame = new WeakMap<HTMLIFrameElement, string>();
const nameByFrame   = new WeakMap<HTMLIFrameElement, string>();

// Coalesce de alturas
const pendingHeights = new Map<HTMLIFrameElement, number>();
let rafId: number | null = null;

// ===== Utilidades =====
const safeOrigin = (url: string) => { try { return new URL(url, window.location.href).origin; } catch { return "*"; } };
const ensureExpandableParent = (el: Element) => { const h = el as HTMLElement; h.style.overflow ||= "visible"; };

function addQuery(url: string, params: Record<string, any>) {
  const u = new URL(url, window.location.href);
  for (const [k,v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    u.searchParams.set(k, String(v));
  }
  return u.toString();
}

function resolveCtx(opts?: LoadAppsOpts): AppCtx {
  const env: any = (import.meta as any)?.env ?? {};
  const q = new URLSearchParams(location.search);

  const orgCandidates = [
    opts?.ctx?.orgId,
    Number(q.get("org")),
    Number(env.VITE_ORG_ID),
  ].filter((v) => Number.isFinite(v) && (v as number) > 0) as number[];

  const orgId = orgCandidates[0];

  const apiBase = (opts?.ctx?.apiBase || env.VITE_API_URL || "").toString();
  const apiKey  = (opts?.ctx?.apiKey  || env.VITE_API_KEY || undefined) as string | undefined;
  const authInQuery = Boolean(
    opts?.ctx?.authInQuery ?? (env.VITE_AUTH_IN_QUERY === "1")
  );
  const wsBase = (opts?.ctx?.wsBase || env.VITE_WS_URL || undefined) as string | undefined;

  if (!orgId) {
    console.warn("[shell] orgId no definido (pasalo en loadApps(..., { ctx: { orgId } })) o ?org= o VITE_ORG_ID.");
  }
  if (!apiBase) {
    console.warn("[shell] apiBase vacío (definí VITE_API_URL o pasalo en ctx.apiBase).");
  }
  return { orgId: orgId as number, apiBase, apiKey, authInQuery, wsBase };
}

function postInit(iframe: HTMLIFrameElement, ctx: AppCtx) {
  const origin = originByFrame.get(iframe) || "*";
  try {
    iframe.contentWindow?.postMessage({ type: "EMBED_INIT", ctx }, origin === "*" ? "*" : origin);
    dlog("msg -> EMBED_INIT", { app: nameByFrame.get(iframe), target: origin, ctx });
  } catch (e) { dwarn("postMessage EMBED_INIT failed", e); }
}

// ===== Listener de altura (idempotente) =====
let autoHeightInstalled = false;
function installAutoHeightListener() {
  if (autoHeightInstalled) return;
  autoHeightInstalled = true;

  window.addEventListener("message", (e: MessageEvent) => {
    const data: any = e.data;
    if (!data || typeof data !== "object") return;
    if (DEBUG) dlog("msg <-", { origin: e.origin, data });
    if (data.type !== "EMBED_HEIGHT") return;

    // Ubicar el iframe emisor
    let frame = e.source ? frameByWindow.get(e.source as Window) : undefined;
    if (!frame) {
      frame = Array.from(document.querySelectorAll("iframe"))
        .find((f) => (f as HTMLIFrameElement).contentWindow === e.source) as HTMLIFrameElement | undefined;
      if (frame && e.source) frameByWindow.set(e.source as Window, frame);
    }
    if (!frame) return;

    const expected = originByFrame.get(frame);
    if (expected && expected !== e.origin) dwarn("origin mismatch; aplico igual (dev)", { expected, got: e.origin });

    const h = Math.max(0, Math.ceil(Number(data.height) || 0));
    if (!h) return;

    pendingHeights.set(frame, h);
    if (rafId == null) {
      rafId = requestAnimationFrame(() => {
        for (const [f, hh] of pendingHeights) {
          f.style.height = `${hh}px`;
          f.style.maxHeight = "none";
          f.style.overflow = "hidden"; // sin scroll propio
          dlog("set height", { app: nameByFrame.get(f), hh });
        }
        pendingHeights.clear();
        rafId = null;
      });
    }
  });
}

// ===== Carga con dedupe =====
export async function loadApps(manifestUrl: string, opts: LoadAppsOpts = {}) {
  installAutoHeightListener();

  const ctx = resolveCtx(opts);
  const shellApi = opts.shellApi ?? {};

  dlog("fetch manifest ->", { manifestUrl });
  const res = await fetch(manifestUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`No pude cargar el manifest: ${res.status}`);
  const apps: App[] = await res.json();
  dlog("manifest ok", { count: apps.length, apps });

  for (const app of apps) {
    try {
      if (app.type === "module") {
        const mountEl = document.querySelector(app.mount);
        if (!mountEl) throw new Error(`Mount no encontrado: ${app.mount}`);
        ensureExpandableParent(mountEl);

        // 🔒 DEDUPE
        if ((mountEl as HTMLElement).dataset.appLoaded === app.name) {
          dlog("module already mounted; skip", { name: app.name, mount: app.mount });
        } else {
          const mod = await import(/* @vite-ignore */ app.url);
          const props = { ctx, shellApi, ...(app as ModuleApp).props };
          if (typeof (mod as any).mount === "function") {
            await (mod as any).mount(mountEl, props);
          } else if (typeof (mod as any).default === "function") {
            await (mod as any).default(mountEl, props);
          } else {
            throw new Error("El módulo no expone mount() ni default()");
          }
          (mountEl as HTMLElement).dataset.appLoaded = app.name;
          dlog("module mounted", { name: app.name, mount: app.mount, ctx });
        }

      } else if (app.type === "webcomponent") {
        const host = document.querySelector(app.mount ?? "body");
        if (!host) throw new Error(`Mount no encontrado: ${app.mount}`);
        ensureExpandableParent(host);

        const tag = (app as WCApp).tag;
        // 🔒 DEDUPE
        const already = tag && (host as HTMLElement).querySelector(tag);
        if (already) {
          dlog("webcomponent already present; skip", { tag, mount: app.mount });
        } else {
          await loadScript(app.url, "module");
          const el = document.createElement(tag) as any;
          // Pasar contexto por propiedad (seguro; incluye apiKey sin exponerla en atributos)
          el.ctx = ctx;
          // Y por atributos “no sensibles” para estilos/testing
          el.setAttribute("data-org-id", String(ctx.orgId ?? ""));
          if (ctx.apiBase) el.setAttribute("data-api-base", ctx.apiBase);
          Object.assign(el, (app as WCApp).props || {});
          (host as HTMLElement).appendChild(el);
          dlog("webcomponent appended", { tag, mount: app.mount, ctx });
        }

      } else if (app.type === "iframe") {
        const mountEl = document.querySelector(app.mount);
        if (!mountEl) throw new Error(`Mount no encontrado: ${app.mount}`);
        ensureExpandableParent(mountEl);

        // 🔒 DEDUPE
        const existing = (mountEl as HTMLElement).querySelector(`iframe[data-app="${app.name}"]`) as HTMLIFrameElement | null;
        if (existing) {
          dlog("iframe already exists; reuse", { name: app.name, mount: app.mount });
          if (existing.contentWindow) frameByWindow.set(existing.contentWindow, existing);
          postInit(existing, ctx);
          console.log(`[shell] ${app.name} cargada`);
          continue;
        }

        // Crear src con ?org= (NO exponer apiKey en URL)
        const src = addQuery(app.url, { org: ctx.orgId });

        // Crear nuevo iframe
        const iframe = document.createElement("iframe");
        iframe.src = src;
        iframe.loading = "lazy";
        iframe.referrerPolicy = "strict-origin-when-cross-origin";
        iframe.style.cssText = [
          'border:0',
          'width:100%',
          'display:block',
          'overflow:hidden',
          'height:1px',
          'min-height:60vh',
          'position:relative',
          'z-index:0'
        ].join(';');
        iframe.allow = app.allow ?? "clipboard-read; clipboard-write; fullscreen";
        iframe.sandbox = app.sandbox ?? "allow-scripts allow-forms allow-same-origin";
        iframe.dataset.app = app.name;

        const expectedOrigin = safeOrigin(src);
        originByFrame.set(iframe, expectedOrigin);
        nameByFrame.set(iframe, app.name);

        iframe.addEventListener("load", () => {
          if (iframe.contentWindow) frameByWindow.set(iframe.contentWindow, iframe);
          dlog("iframe load", { app: app.name, url: src, expectedOrigin, ctx });
          postInit(iframe, ctx);
        });

        // 🔧 FIX: propiedad con clave; antes era "{ ..., e as any }"
        iframe.addEventListener("error", (e) => derr("iframe error", { app: app.name, url: src, e }));

        (mountEl as HTMLElement).appendChild(iframe);
        dlog("iframe appended", { app: app.name, mount: app.mount, url: src });
      }

      console.log(`[shell] ${app.name} cargada`);
    } catch (err) {
      console.error(`[shell] error cargando ${app.name}`, err);
      derr("load error", { app, err });
    }
  }
}

function loadScript(src: string, type: "module" | "text/javascript" = "module") {
  dlog("script load ->", { src, type });
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.type = type;
    s.src = src;
    s.async = true;
    s.crossOrigin = "anonymous";
    s.onload = () => { dlog("script ok", { src }); resolve(); };
    s.onerror = () => { derr("script fail", { src }); reject(new Error(`No se pudo cargar ${src}`)); };
    document.head.appendChild(s);
  });
}
