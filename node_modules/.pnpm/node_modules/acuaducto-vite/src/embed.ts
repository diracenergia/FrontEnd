// src/embed.ts
// Recibe el contexto desde el shell (EMBED_INIT) y publica la altura (EMBED_HEIGHT)
// Además expone helpers de base/headers para pegarle al backend /infra

export type EmbedCtx = {
  orgId?: number;
  apiBase?: string;
  apiKey?: string;
  wsBase?: string;
  authInQuery?: boolean;
};

let _ctx: EmbedCtx = {};
let _subs: Array<() => void> = [];

// ---- Suscripción a cambios de contexto ----
export function onCtx(fn: () => void) {
  _subs.push(fn);
  return () => { _subs = _subs.filter((s) => s !== fn); };
}

// ---- Contexto con fallbacks (LS / query) ----
export function getCtx(): EmbedCtx {
  const q = new URLSearchParams(location.search);
  const ls = (k: string) => localStorage.getItem(k) || undefined;

  // ✅ evitar mezclar ?? con ||
  // orgId: prioridad ctx → ?org → LS → 1
  const orgFromCtx   = _ctx.orgId;
  const orgFromQuery = Number(q.get("org"));
  const orgFromLS    = Number(ls("org_id") || "0");

  let orgId: number | undefined =
    (Number.isFinite(orgFromCtx as any)   && (orgFromCtx as number)   > 0) ? (orgFromCtx as number)   : undefined;
  if (orgId == null) {
    orgId = (Number.isFinite(orgFromQuery) && orgFromQuery > 0) ? orgFromQuery : undefined;
  }
  if (orgId == null) {
    orgId = (Number.isFinite(orgFromLS)    && orgFromLS    > 0) ? orgFromLS    : undefined;
  }
  if (orgId == null) orgId = 1;

  // apiBase: ctx → LS → origin
  const apiBase =
    (_ctx.apiBase != null && _ctx.apiBase !== "") ? _ctx.apiBase :
    (ls("base_url")  != null && ls("base_url")  !== undefined) ? (ls("base_url") as string) :
    (typeof window !== "undefined" ? window.location.origin : "");

  // apiKey / wsBase / authInQuery (solo con ??)
  const apiKey      = _ctx.apiKey      ?? ls("api_key") ?? undefined;
  const wsBase      = _ctx.wsBase      ?? ls("ws_url")  ?? undefined;
  const authInQuery = _ctx.authInQuery ?? false;

  return { orgId, apiBase, apiKey, wsBase, authInQuery };
}

// ---- Base /infra idempotente ----
export function ensureInfraBase(root: string): string {
  const r = (root || "").replace(/\/+$/, "");
  return /\/infra$/i.test(r) ? r : `${r}/infra`;
}

// ---- Headers estándar para /infra ----
export function buildInfraHeaders(ctx = getCtx()): HeadersInit {
  const h: Record<string, string> = {};
  const org = Number(ctx.orgId || 0);
  h["x-org-id"] = String(org > 0 ? org : 1);
  h["x-device-id"] = localStorage.getItem("device_id") || "ui-embed";
  if (ctx.apiKey) h["x-api-key"] = ctx.apiKey;
  return h;
}

// =============================
// Auto-height (EMBED_HEIGHT)
// =============================
function measureHeight(): number {
  const d = document;
  const b = d.body;
  const e = d.documentElement;
  return Math.max(
    b?.scrollHeight || 0,
    e?.scrollHeight || 0,
    b?.offsetHeight || 0,
    e?.offsetHeight || 0,
    b?.clientHeight || 0,
    e?.clientHeight || 0,
  );
}

function postHeight() {
  try {
    const h = measureHeight();
    window.parent?.postMessage({ type: "EMBED_HEIGHT", height: h }, "*");
  } catch { /* no-op */ }
}

let _ro: ResizeObserver | undefined;
let _mo: MutationObserver | undefined;

export function initEmbed(opts?: { autoHeight?: boolean }) {
  // 1) Recibir contexto desde el shell
  window.addEventListener("message", (e: MessageEvent) => {
    const data: any = e.data;
    if (!data || typeof data !== "object") return;
    if (data.type !== "EMBED_INIT") return;

    _ctx = { ..._ctx, ...(data.ctx || {}) };
    // Avisar a suscriptores
    for (const fn of _subs) { try { fn(); } catch {} }

    // Enviar primera altura tras recibir el ctx
    if (opts?.autoHeight !== false) setTimeout(postHeight, 0);
  });

  // 2) Auto-height local (Resize + Mutation + ping de seguridad)
  if (opts?.autoHeight !== false) {
    try {
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    } catch {}

    _ro = new ResizeObserver(() => postHeight());
    _ro.observe(document.documentElement);

    _mo = new MutationObserver(() => {
      requestAnimationFrame(() => postHeight());
    });
    _mo.observe(document.body, { childList: true, subtree: true, attributes: true });

    setInterval(postHeight, 800);
    window.addEventListener("load", () => setTimeout(postHeight, 0));
  }
}
