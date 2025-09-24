// src/lib/config.ts
type InfraConfig = { apiBase?: string; orgId?: string };

const LS_KEYS = { apiBase: "apiBase", orgId: "orgId" } as const;

export function readConfigFromUrl(): InfraConfig {
  if (typeof window === "undefined") return {};
  const u = new URL(window.location.href);
  const apiBase = u.searchParams.get("apiBase") ?? undefined;
  const orgId   = u.searchParams.get("org") ?? u.searchParams.get("orgId") ?? undefined;
  return { apiBase, orgId };
}

export function stashConfigToLS(cfg: InfraConfig) {
  if (typeof window === "undefined") return;
  if (cfg.apiBase) localStorage.setItem(LS_KEYS.apiBase, cfg.apiBase.replace(/\/+$/, ""));
  if (cfg.orgId)   localStorage.setItem(LS_KEYS.orgId, String(cfg.orgId));
}

export function getInfraBase(): string {
  const fromUrl = readConfigFromUrl().apiBase;
  const fromLS  = typeof window !== "undefined" ? localStorage.getItem(LS_KEYS.apiBase) : null;
  const fromEnv = (import.meta as any).env?.VITE_API_URL;
  const base = (fromUrl || fromLS || fromEnv || "").trim().replace(/\/+$/, "");
  if (!base) throw new Error("API base no configurada (apiBase/orgId por URL o VITE_API_URL).");
  return `${base}/infra`;
}

export function getOrgId(): string | undefined {
  const fromUrl = readConfigFromUrl().orgId;
  const fromLS  = typeof window !== "undefined" ? localStorage.getItem(LS_KEYS.orgId) : null;
  return (fromUrl || fromLS) ?? undefined;
}

// 🔌 postMessage: padre → hijo {type:'infra.config', apiBase, orgId}
export function initConfigFromParent(onChange?: (cfg: InfraConfig) => void) {
  if (typeof window === "undefined") return;
  // avisar que el embed está listo
  window.parent?.postMessage({ type: "infra.ready" }, "*");
  window.addEventListener("message", (ev: MessageEvent) => {
    const d: any = ev.data;
    if (!d || d.type !== "infra.config") return;
    const cfg: InfraConfig = { apiBase: d.apiBase, orgId: d.orgId };
    stashConfigToLS(cfg);
    onChange?.(cfg);
  });
}
