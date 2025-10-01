// src/loader.ts
// Orquestador de micro-apps (module / webcomponent / iframe) con:
// - Handshake EMBED_READY → reenvío de EMBED_INIT (ctx) tras HMR/recarga
// - Auto-height vía EMBED_HEIGHT (coalesced con rAF)
// - Altura fija opcional por manifest: fixedHeight
// - Dedupe por mount/tag para evitar montajes duplicados
// - Modo embed y ruta inicial para iframes (query ?route= o hash #/path)
// - LOGS detallados de: manifest, mounts, src finales, handshakes, alturas, timeouts, etc.

type ModuleApp = {
  name: string;
  type: "module";
  url: string;
  mount: string;
  props?: any;
};

type WCApp = {
  name: string;
  type: "webcomponent";
  url: string;
  tag: string;
  mount?: string;
  props?: any;
};

type IFrameApp = {
  name: string;
  type: "iframe";
  url: string;                  // ej: "/apps/kpi/" o "/apps/infra/"
  mount: string;                // selector del host donde montar el <iframe>
  allow?: string;
  sandbox?: string;
  fixedHeight?: string;         // "720px" — si se define, ignora EMBED_HEIGHT
  // NUEVO:
  route?: string;               // ruta interna a la que caer (ej: "/operaciones")
  hashRouting?: boolean;        // true si la micro-app usa HashRouter → pone #/ruta
  params?: Record<string, any>; // query extra a anexar al src
  className?: string;           // clase css opcional para el iframe
};

type App = ModuleApp | WCApp | IFrameApp;

export type AppCtx = {
  orgId: number;
  apiBase: string;
  apiKey?: string;      // no se inyecta en URL; solo por postMessage
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
function group(title: string, body?: () => void, data?: any) {
  if (!DEBUG) return body?.();
  console.groupCollapsed("%c[embed]%c " + title, "color:#8B5CF6", "color:inherit");
  if (data !== undefined) console.log(data);
  try { body?.(); } finally { console.groupEnd(); }
}

// ===== Mapeos =====
const frameByWindow = new Map<Window, HTMLIFrameElement>();
const originByFrame = new WeakMap<HTMLIFrameElement, string>();
const nameByFrame   = new WeakMap<HTMLIFrameElement, string>();

// ===== Estado =====
const pendingHeights = new Map<HTMLIFrameElement, number>();
let rafId: number | null = null;
let autoHeightInstalled = false;
let globalErrorInstalled = false;
let lastCtx: AppCtx | null = null;

// Espera de EMBED_READY (para diagnosticar auto-embed)
// Guardamos timeout por iframe; limpiamos cuando llega READY
const readyWait = new WeakMap<HTMLIFrameElement, number>();

// ===== Utils =====
const safeOrigin = (url: string) => {
  try { return new URL(url, window.location.href).origin; }
  catch { return "*"; }
};
const ensureExpandableParent = (el: Element) => {
  const h = el as HTMLElement;
  h.style.overflow ||= "visible";
};

function addQuery(url: string, params: Record<string, any>) {
  const u = new URL(url, window.location.href);
  for (const [k, v] of Object.entries(params)) {
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
  const authInQuery = Boolean(opts?.ctx?.authInQuery ?? (env.VITE_AUTH_IN_QUERY === "1"));
  const wsBase = (opts?.ctx?.wsBase || env.VITE_WS_URL || undefined) as string | undefined;

  if (!orgId)  console.warn("[shell] orgId no definido (pasalo en loadApps(..., { ctx: { orgId } })) o ?org= o VITE_ORG_ID.");
  if (!apiBase) console.warn("[shell] apiBase vacío (definí VITE_API_URL o pasalo en ctx.apiBase).");

  return { orgId: orgId as number, apiBase, apiKey, authInQuery, wsBase };
}

function installGlobalErrorLogger() {
  if (globalErrorInstalled) return;
  globalErrorInstalled = true;
  window.addEventListener("error", (e) => derr("window error", e.error || e.message || e));
  window.addEventListener("unhandledrejection", (e) => derr("unhandledrejection", e.reason || e));
  dlog("global error logger installed");
}

function postInit(iframe: HTMLIFrameElement, ctx: AppCtx) {
  const origin = originByFrame.get(iframe) || "*";
  try {
    iframe.contentWindow?.postMessage({ type: "EMBED_INIT", ctx }, origin === "*" ? "*" : origin);
    dlog("msg -> EMBED_INIT", { app: nameByFrame.get(iframe), target: origin, ctx });
  } catch (e) {
    dwarn("postMessage EMBED_INIT failed", e);
  }
}

function resolveFrameFromEvent(e: MessageEvent): HTMLIFrameElement | undefined {
  if (e.source && frameByWindow.has(e.source as Window)) {
    return frameByWindow.get(e.source as Window);
  }
  const found = Array.from(document.querySelectorAll("iframe"))
    .find((f) => (f as HTMLIFrameElement).contentWindow === e.source) as HTMLIFrameElement | undefined;
  if (found && e.source) frameByWindow.set(e.source as Window, found);
  return found;
}

// ===== Listener de mensajes (READY/HEIGHT) =====
function installAutoHeightListener() {
  if (autoHeightInstalled) return;
  autoHeightInstalled = true;
  dlog("autoHeight listener installed");

  window.addEventListener("message", (e: MessageEvent) => {
    const data: any = e.data;
    if (!data || typeof data !== "object") return;

    const frame = resolveFrameFromEvent(e);
    if (DEBUG) {
      group("message <-", undefined, {
        origin: e.origin, type: data.type, hasFrame: !!frame,
        sample: data.type === "EMBED_HEIGHT" ? { height: data.height } : data
      });
    }
    if (!frame) return;

    // Handshake: micro-app lista → reenvío de contexto
    if (data.type === "EMBED_READY") {
      const t = readyWait.get(frame);
      if (t) { clearTimeout(t); readyWait.delete(frame); }
      dlog("EMBED_READY from app", { app: nameByFrame.get(frame), origin: e.origin });
      if (lastCtx) postInit(frame, lastCtx);
      return;
    }

    // Auto-height
    if (data.type !== "EMBED_HEIGHT") return;

    // Si la app fijó altura en manifest, ignorar mensajes de altura
    if ((frame.dataset.fixedHeight ?? "") !== "") return;

    const expected = originByFrame.get(frame);
    if (expected && expected !== e.origin) {
      dwarn("origin mismatch; aplico igual (dev)", { expected, got: e.origin, app: nameByFrame.get(frame) });
    }

    const h = Math.max(0, Math.ceil(Number(data.height) || 0));
    if (!h) return;

    pendingHeights.set(frame, h);
    if (rafId == null) {
      rafId = requestAnimationFrame(() => {
        for (const [f, hh] of pendingHeights) {
          f.style.height = `${hh}px`;
          f.style.maxHeight = "none";
          f.style.overflow = "hidden"; // sin scroll propio
          dlog("set height", { app: nameByFrame.get(f), height: hh });
        }
        pendingHeights.clear();
        rafId = null;
      });
    }
  });
}

// ===== Helpers de iframe =====
function buildIframeSrc(app: IFrameApp, ctx: AppCtx) {
  // Base + embed + org + params extra
  let src = addQuery(app.url, {
    embed: 1,
    org: ctx.orgId,
    ...(app.params || {})
  });

  // Ruta inicial (query ?route= o hash #/path)
  const route = app.route?.trim();
  if (route) {
    if (app.hashRouting) {
      const u = new URL(src, window.location.href);
      const clean = route.startsWith("#") ? route.slice(1) : route.replace(/^\/+/, "");
      u.hash = clean ? `/${clean}` : "";
      src = u.toString();
    } else {
      src = addQuery(src, { route });
    }
  }
  if (DEBUG) dlog("buildIframeSrc", { name: app.name, base: app.url, route, hashRouting: !!app.hashRouting, final: src });
  return src;
}

function looksLikeSelfEmbed(url: string) {
  try {
    const u = new URL(url, window.location.href);
    // mismo origin SIEMPRE en dev (proxy) → no alcanza comparar pathname con el del shell
    // este check solo evita el caso obvio de apuntar exactamente al mismo path
    return u.origin === window.location.origin && u.pathname === window.location.pathname;
  } catch { return false; }
}

// ===== Carga principal =====
export async function loadApps(manifestUrl: string, opts: LoadAppsOpts = {}) {
  installGlobalErrorLogger();
  installAutoHeightListener();

  const ctx = resolveCtx(opts);
  lastCtx = ctx; // guardar para re-init tras HMR/recarga
  const shellApi = opts.shellApi ?? {};

  group("loadApps start", () => {}, { manifestUrl, ctx, shellApiKeys: Object.keys(shellApi || {}) });

  const res = await fetch(manifestUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`No pude cargar el manifest: ${res.status}`);
  const apps: App[] = await res.json();

  group("manifest ok", () => {
    try { console.table(apps.map((a: any) => ({ name: a.name, type: a.type, mount: a.mount, url: a.url }))); } catch {}
  }, { count: apps.length });

  for (const app of apps) {
    const t0 = performance.now();
    try {
      // ====== MODULE ======
      if (app.type === "module") {
        group(`module "${app.name}"`, () => {
          const mountEl = document.querySelector(app.mount);
          console.log("mount exists?", !!mountEl, "→", app.mount);
          if (!mountEl) throw new Error(`Mount no encontrado: ${app.mount}`);
          ensureExpandableParent(mountEl);

          if ((mountEl as HTMLElement).dataset.appLoaded === app.name) {
            console.log("dedupe: already mounted → skip");
          } else {
            console.log("import →", app.url);
            (async () => {
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
              console.log("mounted", { props });
            })();
          }
        });

      // ====== WEBCOMPONENT ======
      } else if (app.type === "webcomponent") {
        group(`webcomponent "${app.name}"`, () => {
          const host = document.querySelector(app.mount ?? "body");
          console.log("mount exists?", !!host, "→", app.mount);
          if (!host) throw new Error(`Mount no encontrado: ${app.mount}`);
          ensureExpandableParent(host);

          const tag = (app as WCApp).tag;
          const already = tag && (host as HTMLElement).querySelector(tag);
          if (already) {
            console.log("dedupe: tag already present → skip");
          } else {
            console.log("load script →", app.url);
            (async () => {
              await loadScript(app.url, "module");
              const el = document.createElement(tag) as any;
              (el as any).ctx = ctx;
              el.setAttribute("data-org-id", String(ctx.orgId ?? ""));
              if (ctx.apiBase) el.setAttribute("data-api-base", ctx.apiBase);
              Object.assign(el, (app as WCApp).props || {});
              (host as HTMLElement).appendChild(el);
              console.log("webcomponent appended");
            })();
          }
        });

      // ====== IFRAME ======
      } else if (app.type === "iframe") {
        group(`iframe "${app.name}"`, () => {
          const mountEl = document.querySelector(app.mount);
          console.log("mount exists?", !!mountEl, "→", app.mount);
          if (!mountEl) throw new Error(`Mount no encontrado: ${app.mount}`);
          ensureExpandableParent(mountEl);

          const src = buildIframeSrc(app as IFrameApp, ctx);
          console.log("iframe src (final) →", src);

          if (looksLikeSelfEmbed(src)) {
            console.error(`[shell] BLOQUEADO: ${(app as IFrameApp).url} parece ser la app principal.
Revisá manifest (url debe ser /apps/kpi/ o /apps/infra/) y proxy del shell.`);
            return; // NO montar
          }

          const existing = (mountEl as HTMLElement).querySelector(
            `iframe[data-app="${app.name}"]`
          ) as HTMLIFrameElement | null;

          if (existing) {
            console.log("dedupe: iframe already exists → reuse");
            if (existing.contentWindow) frameByWindow.set(existing.contentWindow, existing);
            postInit(existing, ctx);
            console.info(`[shell] ${app.name} cargada (reuse)`);
            return;
          }

          const iframe = document.createElement("iframe");
          iframe.src = src;
          iframe.title = app.name;
          iframe.loading = "lazy";
          iframe.referrerPolicy = "strict-origin-when-cross-origin";
          iframe.className = (app as IFrameApp).className || "";
          iframe.style.cssText = [
            "border:0",
            "width:100%",
            "display:block",
            "overflow:hidden",
            "height:1px",
            "min-height:60vh",
            "position:relative",
            "z-index:0"
          ].join(";");
          iframe.allow   = (app as IFrameApp).allow   ?? "clipboard-read; clipboard-write; fullscreen";
          iframe.sandbox = (app as IFrameApp).sandbox ?? "allow-scripts allow-forms allow-same-origin";
          iframe.dataset.app = app.name;

          if ((app as IFrameApp).fixedHeight) {
            iframe.style.height = (app as IFrameApp).fixedHeight!;
            iframe.style.minHeight = "0";
            iframe.dataset.fixedHeight = "1";
            console.log("fixedHeight set →", (app as IFrameApp).fixedHeight);
          }

          const expectedOrigin = safeOrigin(src);
          originByFrame.set(iframe, expectedOrigin);
          nameByFrame.set(iframe, app.name);

          // Espera explícita de READY (si no llega, probablemente proxiaste mal y recibiste el shell)
          const timeoutMs = 2500;
          const to = window.setTimeout(() => {
            // intento leer información del doc embebido (mismo origen vía proxy ⇒ accesible)
            let innerPath = "";
            let innerTitle = "";
            try {
              innerPath = (iframe.contentWindow as any)?.location?.pathname || "";
              innerTitle = (iframe.contentDocument as any)?.title || "";
            } catch {}
            console.error(`[embed][timeout] No llegó EMBED_READY de "${app.name}" en ${timeoutMs}ms.
Esto puede indicar auto-embed del shell o que la micro-app no envía READY.
innerPath="${innerPath}" title="${innerTitle}" src="${iframe.src}"`);
          }, timeoutMs);
          readyWait.set(iframe, to);

          iframe.addEventListener("load", () => {
            if (iframe.contentWindow) frameByWindow.set(iframe.contentWindow, iframe);

            let innerPath = "";
            let innerTitle = "";
            try {
              innerPath = (iframe.contentWindow as any)?.location?.pathname || "";
              innerTitle = (iframe.contentDocument as any)?.title || "";
            } catch {}

            dlog("iframe load", { app: app.name, url: src, expectedOrigin, innerPath, innerTitle, ctx });
            postInit(iframe, ctx);

            const r = (app as IFrameApp).route?.trim();
            if (r) {
              try {
                iframe.contentWindow?.postMessage({ type: "EMBED_NAVIGATE", path: r }, expectedOrigin || "*");
                dlog("msg -> EMBED_NAVIGATE", { app: app.name, path: r });
              } catch {}
            }
          });

          iframe.addEventListener("error", (e) =>
            derr("iframe error", { app: app.name, url: src, e })
          );

          (mountEl as HTMLElement).appendChild(iframe);
          console.info(`[embed] <iframe data-app="${app.name}"> appended →`, iframe.src);
        });
      }

      console.log(`[shell] ${app.name} cargada en ${(performance.now() - t0).toFixed(1)}ms`);
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
