// src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Layers3, Edit3 } from "lucide-react";

import Button from "@/components/ui/Button";
import Legend from "@/components/Legend";
import Edge from "@/components/diagram/Edge";
import { Tank, Pump, Valve, Manifold, AutoGroupBox } from "@/components/diagram/nodes";
import useDragNode from "@/hooks/useDragNode";
import { nodeHalfSize } from "@/utils/nodeDims";
import { computeAutoLayout } from "@/layout/auto";
import { setNodeResolver } from "@/utils/paths";

import type { NodeBase } from "@/types/graph";



/* ========= Bootstrap de configuración para iframes ========= */

const CONFIG_EVENT = "EMBED_CONFIG_UPDATED";
function notifyConfigUpdated() {
  try { window.dispatchEvent(new Event(CONFIG_EVENT)); } catch {}
}

// 1) Leer config de la URL (?api_base=&api_key=&org_id=)
function readConfigFromQuery() {
  try {
    const sp = new URLSearchParams(window.location.search);
    const apiBase = sp.get("api_base") || sp.get("apiBase");
    const apiKey  = sp.get("api_key")  || sp.get("apiKey");
    const orgId   = sp.get("org_id")   || sp.get("orgId");
    if (apiBase || apiKey || orgId) {
      console.group("[EMBED][QUERY] Config recibida por query");
      console.log("apiBase:", apiBase);
      console.log("apiKey:", apiKey ? "(set)" : "(missing)");
      console.log("orgId:", orgId);
      console.groupEnd();
    }
    return { apiBase, apiKey, orgId };
  } catch {
    return {};
  }
}

// 2) Guardar en localStorage de ESTE origen (iframe)
function persistConfig({ apiBase, apiKey, orgId }: { apiBase?: string | null; apiKey?: string | null; orgId?: string | null; }) {
  try {
    if (apiBase) localStorage.setItem("apiBase", String(apiBase));
    if (apiKey)  localStorage.setItem("apiKey",  String(apiKey));
    if (orgId)   localStorage.setItem("orgId",   String(orgId));
    console.group("[EMBED] persistConfig");
    console.log("apiBase:", apiBase);
    console.log("apiKey:", apiKey ? "(set)" : "(missing)");
    console.log("orgId:", orgId);
    console.groupEnd();
    notifyConfigUpdated();
  } catch {}
}

// 3) Handshake con el padre
(function setupEmbedConfigHandshake() {
  const q = readConfigFromQuery();
  if (q.apiBase || q.apiKey || q.orgId) persistConfig(q);

  window.addEventListener("message", (ev) => {
    const data = ev?.data || {};
    if (data?.type === "EMBED_CONFIG" && (data.apiBase || data.apiKey || data.orgId)) {
      console.group("[EMBED][PM] EMBED_CONFIG recibido via postMessage");
      console.log("data.apiBase:", data.apiBase);
      console.log("data.apiKey:", data.apiKey ? "(set)" : "(missing)");
      console.log("data.orgId:", data.orgId);
      console.groupEnd();
      persistConfig(data);
      window.parent?.postMessage({ type: "EMBED_CONFIG_ACK" }, "*");
    }
  });

  console.log("[EMBED] Enviando EMBED_READY al host…");
  window.parent?.postMessage({ type: "EMBED_READY" }, "*");
})();

/* ============================
   Helpers de configuración
   ============================ */
function envAny(): any { return (import.meta as any)?.env ?? {}; }
function trimSlash(s: string) { return String(s || "").replace(/\/+$/, ""); }
function ensureInfraBase(httpBase: string) {
  const base = trimSlash(httpBase);
  return base.endsWith("/infra") ? base : `${base}/infra`;
}
function getHttpDefault(): string {
  const origin = typeof window !== "undefined" ? trimSlash(window.location.origin) : "";
  const isViteDev = /^http:\/\/(localhost|127\.0\.0\.1):517\d$/i.test(origin);
  if (isViteDev) {
    console.warn("[EMBED][WARN] Origin dev Vite:", origin, "→ usando backend http://127.0.0.1:8000");
    return "http://127.0.0.1:8000";
  }
  return origin || "http://127.0.0.1:8000";
}
/** Base HTTP para /infra (ENV > LS > default coherente) */
function getInfraBase(): string {
  const e = envAny();
  const envBase = trimSlash(e?.VITE_API_URL || e?.VITE_API_HTTP_URL || "");
  const lsBase  = typeof localStorage !== "undefined" ? trimSlash(localStorage.getItem("apiBase") || "") : "";
  const base    = trimSlash(envBase || lsBase || getHttpDefault());
  const finalBase = ensureInfraBase(base);
  if (/^http:\/\/(localhost|127\.0\.0\.1):517\d\/infra$/i.test(finalBase)) {
    console.warn("[EMBED][WARN] La base apunta al dev-server de Vite:", finalBase, "→ esto dará 404. Configurá api_base o VITE_API_URL.");
  }
  return finalBase;
}
/** API Key (ENV > LS > sin fallback) */
function getApiKey(): string {
  const e = envAny();
  const envKey = String(e?.VITE_API_KEY || "");
  const lsKey  = typeof localStorage !== "undefined" ? String(localStorage.getItem("apiKey") || "") : "";
  const key = envKey || lsKey || "";
  if (!key) console.warn("[EMBED][WARN] API Key ausente.");
  return key;
}
/** Org Id (ENV > LS > default "1") */
function getOrgId(): string {
  const e = envAny();
  const raw = e?.VITE_ORG_ID ?? (typeof localStorage !== "undefined" ? localStorage.getItem("orgId") : null);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? String(n) : "1";
}
/** Headers comunes para backend */
function infraHeaders(): HeadersInit {
  const h: Record<string, string> = { Accept: "application/json" };
  const key = getApiKey();
  if (key) { h["X-API-Key"] = key; h["Authorization"] = `Bearer ${key}`; }
  const org = getOrgId();
  if (org) h["X-Org-Id"] = org;
  return h;
}
async function fetchJSON<T>(url: string): Promise<T> {
  const headers = infraHeaders();
  console.groupCollapsed("[FETCH] GET", url);
  console.log("base:", getInfraBase());
  console.log("orgId:", getOrgId());
  console.log("apiKey:", getApiKey() ? "(set)" : "(missing)");
  console.log("headers:", headers);
  console.groupEnd();

  const r = await fetch(url, { headers, mode: "cors" });
  if (!r.ok) {
    let text = "";
    try { text = await r.text(); } catch {}
    const diag = `(${r.status}) ${r.statusText} • base=${getInfraBase()} • org=${getOrgId()} • key=${getApiKey() ? "set" : "missing"}`;
    console.error("[FETCH][ERROR]", url, diag, text);
    throw new Error(`${diag}${text ? " • " + text : ""}`);
  }
  return r.json() as Promise<T>;
}

// Guardado de posición en la DB (autosave)
async function saveNodePosToBackend(id: string, x: number, y: number) {
  try {
    const API_INFRA = getInfraBase();
    const headers: HeadersInit = { ...infraHeaders(), "Content-Type": "application/json" };
    const body = JSON.stringify([{ id, x, y }]);
    const r = await fetch(`${API_INFRA}/layout`, { method: "POST", headers, body });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`POST /layout -> ${r.status} ${r.statusText} ${t}`);
    }
  } catch (e) {
    console.warn("[EMBED] No se pudo guardar el layout en backend:", e);
  }
}

/* ============================
   API root (para /tanks/status)
   ============================ */
function getApiRoot(): string {
  // Igual a getHttpDefault() pero SIN ensureInfraBase
  const e = envAny();
  const envBase = trimSlash(e?.VITE_API_URL || e?.VITE_API_HTTP_URL || "");
  const lsBase  = typeof localStorage !== "undefined" ? trimSlash(localStorage.getItem("apiBase") || "") : "";
  const base    = trimSlash(envBase || lsBase || getHttpDefault());
  return base; // p.ej. http://127.0.0.1:8000
}

/* ============================
   Types para /infra/graph
   ============================ */
type ApiNode = {
  id?: string;
  type: 'tank' | 'pump' | 'valve' | 'manifold';
  name: string;
  level?: number | null;
  capacity?: number | null;
  status?: boolean | 'on'|'standby'|'fault'|'unknown'|null;
  kW?: number | null;
  state?: 'open'|'closed'|'throttle'|null;
  x?: number; y?: number;
  code?: string | null;
  asset_id?: number;
};
type ApiGraph = { nodes: ApiNode[]; edges: string[] };
type AB = { a: string; b: string };

/* ============================
   Utils de UI
   ============================ */
const preventMiddleAux: React.MouseEventHandler<any> = (e) => {
  if ((e as any).button === 1) { e.preventDefault(); e.stopPropagation(); }
};

type ViewBox = { x: number; y: number; w: number; h: number };

function nodesBBox(nodes: NodeBase[]) {
  let minX = +Infinity, minY = +Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const { halfW, halfH } = nodeHalfSize(n.type);
    minX = Math.min(minX, n.x - halfW);
    minY = Math.min(minY, n.y - halfH);
    maxX = Math.max(maxX, n.x + halfW);
    maxY = Math.max(maxY, n.y + halfH);
  }
  const pad = 120;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

export default function App() {
  const [edit, setEdit] = useState(false);
  const [tick, setTick] = useState(0);

  // Estado: nodos y edges (ya no usamos NODES/byId globales)
  const [nodes, setNodes] = useState<NodeBase[]>([]);
  const byId = useMemo(() => Object.fromEntries(nodes.map(n => [n.id, n])) as Record<string, NodeBase>, [nodes]);
const [edges, setEdges] = useState<AB[]>([]);

  // Registrar resolver global para orthogonalPath(a,b)
useEffect(() => {
 setNodeResolver((id) => byId[id]);
}, [byId]);


  // escucha cambios de config (cuando el host manda EMBED_CONFIG)
  const [configTick, setConfigTick] = useState(0);
  useEffect(() => {
    const onCfg = () => { console.log("[EMBED] Config actualizada, reintentando cargas…"); setConfigTick((t) => t + 1); };
    window.addEventListener(CONFIG_EVENT, onCfg);
    return () => window.removeEventListener(CONFIG_EVENT, onCfg);
  }, []);

  // === Reportar altura al padre (evita doble scroll) ===
  useEffect(() => {
    const reportHeight = () => {
      const h = document.documentElement.scrollHeight;
      window.parent?.postMessage({ type: "EMBED_HEIGHT", height: h }, "*");
    };
    reportHeight();
    const ro = new ResizeObserver(reportHeight);
    ro.observe(document.documentElement);
    window.addEventListener("load", reportHeight);
    return () => { ro.disconnect(); window.removeEventListener("load", reportHeight); };
  }, []);

  // --------------------------
  // ViewBox (pan & zoom)
  // --------------------------
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [vb, setVb] = useState<ViewBox>(() => {
    const bb = nodesBBox([]); // arranca vacío; luego ajustamos
    return { x: bb.minX || -400, y: bb.minY || -300, w: bb.w || 1600, h: bb.h || 900 };
  });
  const vbRef = useRef(vb);
  vbRef.current = vb;

  const rafRef = useRef<number | null>(null);
  const scheduleTick = () => {
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(() => { setTick((t) => t + 1); rafRef.current = null; });
    }
  };

  const fitToContent = () => {
    if (!nodes.length) return;
    const bb = nodesBBox(nodes);
    setVb({ x: bb.minX, y: bb.minY, w: bb.w, h: bb.h });
  };

  function zoomBy(deltaY: number, clientX: number, clientY: number) {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const { x, y, w, h } = vbRef.current;

    const px = x + ((clientX - rect.left) / rect.width) * w;
    const py = y + ((clientY - rect.top) / rect.height) * h;

    const k = Math.pow(1.0015, deltaY);
    const nw = Math.max(200, Math.min(50000, w * k));
    const nh = Math.max(200, Math.min(50000, h * k));

    const nx = px - ((px - x) * nw) / w;
    const ny = py - ((py - y) * nh) / h;

    setVb({ x: nx, y: ny, w: nw, h: nh });
  }

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const onWheelNative = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomBy(e.deltaY, e.clientX, e.clientY); }
    };
    svg.addEventListener("wheel", onWheelNative, { passive: false });

    const ro = new ResizeObserver(() => fitToContent());
    const host = svg.parentElement;
    if (host) ro.observe(host);

    return () => { svg.removeEventListener("wheel", onWheelNative); ro.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length]);

  // --------------------------
  // Pan con ruedita PRESIONADA
  // --------------------------
  const panning = useRef({ active: false, start: { x: 0, y: 0 }, vb0: { x: 0, y: 0, w: 0, h: 0 } as ViewBox });
  function startPan(e: React.PointerEvent) {
    const svg = svgRef.current!; e.preventDefault(); svg.setPointerCapture(e.pointerId);
    panning.current.active = true; panning.current.start = { x: e.clientX, y: e.clientY }; panning.current.vb0 = vbRef.current;
  }
  function movePan(e: React.PointerEvent) {
    if (!panning.current.active) return;
    const svg = svgRef.current!; const rect = svg.getBoundingClientRect();
    const dxClient = e.clientX - panning.current.start.x; const dyClient = e.clientY - panning.current.start.y;
    const sx = vbRef.current.w / rect.width; const sy = vbRef.current.h / rect.height;
    const nx = panning.current.vb0.x - dxClient * sx; const ny = panning.current.vb0.y - dyClient * sy;
    setVb((prev) => ({ ...prev, x: nx, y: ny }));
  }
  function endPan(e: React.PointerEvent) { const svg = svgRef.current!; try { svg.releasePointerCapture(e.pointerId); } catch {} panning.current.active = false; }
  const onSvgPointerDown: React.PointerEventHandler<SVGSVGElement> = (e) => { if (e.button === 1) startPan(e); };
  const onSvgPointerMove:  React.PointerEventHandler<SVGSVGElement> = (e) => movePan(e);
  const onSvgPointerUp:    React.PointerEventHandler<SVGSVGElement> = (e) => endPan(e);
  const onSvgPointerCancel:React.PointerEventHandler<SVGSVGElement> = (e) => endPan(e);

  // --------------------------
  // Cargar GRAFO DESDE BACKEND
  // --------------------------
  useEffect(() => {
    (async () => {
      try {
        const API_INFRA = getInfraBase();
        const data = await fetchJSON<ApiGraph>(`${API_INFRA}/graph`);
        // mapear nodos API -> NodeBase (id estable del backend)
        let mapped: NodeBase[] = (data.nodes || []).map((n) => {
          const id = n.id || (n.code ? `${n.type}:${n.code}` : `${n.type}_${n.asset_id ?? ''}`);
          const base: NodeBase = {
            id,
            type: n.type,
            name: n.name,
            x: Number.isFinite(n.x) ? (n.x as number) : 0,
            y: Number.isFinite(n.y) ? (n.y as number) : 0,
            // asset_id para cruzar con /tanks/status
            asset_id: typeof n.asset_id === 'number' ? n.asset_id : undefined,
          };
          if (n.type === 'tank')  {
  const lvlRaw = (n.level as any);
  const lvl = typeof lvlRaw === 'number'
    ? (lvlRaw > 1 ? Math.max(0, Math.min(100, lvlRaw)) / 100
                  : Math.max(0, Math.min(1, lvlRaw)))
    : undefined;
  base.level = lvl;
  base.capacity = n.capacity ?? undefined;
}

          if (n.type === 'pump')  {
  const stRaw = (n.status as any);
  const st =
    typeof stRaw === 'boolean' ? (stRaw ? 'on' : 'standby') // true → on, false → standby (apagada)
    : (stRaw ?? 'unknown');                                // si ya viene en string, lo respetamos
  base.status = st as any;
  base.kW = n.kW ?? undefined;
}

          if (n.type === 'valve') { base.state  = (n.state  as any) ?? 'open'; }
          return base;
        });

        // autolayout si no vinieron posiciones
        const needLayout = mapped.some(m => !Number.isFinite(m.x) || !Number.isFinite(m.y));
        if (needLayout) mapped = computeAutoLayout(mapped);

        setNodes(mapped);

        // edges "SRC>DST" -> {a,b}
        const parsed: AB[] = (data.edges || []).map((s) => {
          const [aRaw, bRaw] = String(s).split('>');
          return { a: aRaw, b: bRaw };
        });
        setEdges(parsed);

        // fit al contenido
        // se hace en effect de resize/wheel o directo:
        setTimeout(() => fitToContent(), 0);

        console.info('[EMBED] Graph cargado:', { nodes: mapped.length, edges: parsed.length });
      } catch (e) {
        console.warn('[EMBED] No se pudo cargar /infra/graph:', e);
        setNodes([]); setEdges([]);
      }
    })();
  }, [configTick]);

  // --------------------------
  // Merge de /tanks/status → color_hex en tanques
  // --------------------------
 const nodesWithStatus = nodes;

  // --- Helpers de estado hidráulico (SIN gravedad) ---
function isOpenValve(n: NodeBase) {
  return n.type !== 'valve' || n.state !== 'closed'; // válvula cerrada corta
}
function isPumpOn(n: NodeBase) {
  return n.type === 'pump' && n.status === 'on';
}
/** Regla: fluye solo si
 *  - no hay válvulas cerradas en ninguno de los extremos, y
 *  - hay al menos una bomba ON en A o en B
 */
function isEdgeActive(A: NodeBase, B: NodeBase): boolean {
  if (!isOpenValve(A) || !isOpenValve(B)) return false;
  return isPumpOn(A) || isPumpOn(B);
}


  // --------------------------
  // Overlay draggable por nodo (con autosave)
  // --------------------------
  const DraggableOverlay: React.FC<{ id: string }> = ({ id }) => {
    const n = byId[id];
    if (!n) return null;
    const { halfW, halfH } = nodeHalfSize(n.type ?? "tank");
    const [pressed, setPressed] = useState(false);

    const x = n.x - halfW - 8;
    const y = n.y - halfH - 8;
    const w = halfW * 2 + 16;
    const h = halfH * 2 + 16;

    const drag = useDragNode({
      id,
      enabled: edit,
      getPos: (id) => {
        const node = byId[id];
        return node ? { x: node.x, y: node.y } : null;
      },
      setPos: (id, x, y) => {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const node = byId[id];
        if (node) { node.x = x; node.y = y; scheduleTick(); }
      },
      snap: 10,
      onEnd: () => {
        const node = byId[id];
        if (node && Number.isFinite(node.x) && Number.isFinite(node.y)) {
          // persistimos local y backend
          saveLayoutToStorage();
          saveNodePosToBackend(id, node.x, node.y);
        }
      },
    });

    return (
      <g>
        {pressed && (
          <rect
            x={x - 3}
            y={y - 3}
            width={w + 6}
            height={h + 6}
            rx={10}
            fill="none"
            stroke="rgb(56 189 248)"
            strokeWidth={2}
            pointerEvents="none"
          />
        )}
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx={8}
          fill="black"
          fillOpacity={0.04}
          pointerEvents={edit ? ("all" as any) : ("none" as any)}
          stroke={edit ? (pressed ? "rgb(56 189 248)" : "rgb(203 213 225)") : "none"}
          strokeWidth={edit ? 1.5 : 0}
          strokeDasharray={edit ? "4 4" : undefined}
          style={{ cursor: edit ? (pressed ? "grabbing" : "grab") : "default", touchAction: "none" }}
          onPointerDown={(e) => { setPressed(true); drag.onPointerDown(e as any); }}
          onPointerUp={(e) => { setPressed(false); drag.onPointerUp(e as any); }}
          onPointerCancel={(e) => { setPressed(false); drag.onPointerUp(e as any); }}
          onContextMenu={(e) => e.preventDefault()}
          onAuxClick={(e) => { if ((e as any).button === 1) { e.preventDefault(); e.stopPropagation(); } }}
        />
      </g>
    );
  };

  // --------------------------
  // Reset / Export / Import (layout local)
  // --------------------------
  function saveLayoutToStorage() {
    try {
      const data = nodes.map(n => ({ id: n.id, x: n.x, y: n.y }));
      localStorage.setItem("infra_layout", JSON.stringify(data));
    } catch {}
  }
  function loadLayoutFromStorage(): Array<{ id: string; x: number; y: number }> | null {
    try {
      const raw = localStorage.getItem("infra_layout");
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }
  function exportLayout() {
    return nodes.map(n => ({ id: n.id, x: n.x, y: n.y }));
  }
  function importLayout(arr: Array<{ id: string; x: number; y: number }>) {
    const next = nodes.map(n => {
      const hit = arr.find(a => a.id === n.id);
      return hit ? { ...n, x: hit.x, y: hit.y } : n;
    });
    setNodes(next);
  }

  function resetAuto() {
    const fresh = computeAutoLayout(nodes);
    setNodes(fresh);
    saveLayoutToStorage();
    setTimeout(() => fitToContent(), 0);
  }

  function doExportJSON() {
    const data = exportLayout();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "layout-acueducto.json"; a.click();
    URL.revokeObjectURL(url);
  }
  function doImportJSON(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const arr = JSON.parse(String(reader.result));
        importLayout(arr);
        saveLayoutToStorage();
        setTimeout(() => { scheduleTick(); fitToContent(); }, 0);
      } catch { alert("Archivo inválido"); }
    };
    reader.readAsText(file);
  }
  const importInputRef = useRef<HTMLInputElement | null>(null);

  // --------------------------
  // Agrupaciones por ubicación (desde backend)
  // --------------------------
  const [locGroups, setLocGroups] = useState<Array<{ label: string; ids: string[] }>>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);

  useEffect(() => {
    const API_INFRA = getInfraBase();
    setGroupsLoading(true);
    (async () => {
      try {
        const locs = await fetchJSON<InfraLocation[]>(`${API_INFRA}/locations`);
        // índice code -> id (si el backend usa code para assets)
        const codeIndex = new Map<string, string>();
        for (const n of nodes) {
          // si tu backend manda code, podrías guardar n.code al mapear
          const maybeCode = (n.id.includes(':') ? n.id.split(':')[1] : undefined);
          if (maybeCode) codeIndex.set(maybeCode, n.id);
        }

        const groups: Array<{ label: string; ids: string[] }> = [];
        for (const loc of locs) {
          const assets = await fetchJSON<InfraAssetGroup[]>(`${API_INFRA}/locations/${loc.id}/assets`);
          const ids = Array.from(
            new Set(
              assets
                .flatMap((g) => g.items.map((a) => a.code || ""))
                .map((code) => codeIndex.get(code) || "")
                .filter((id) => !!id && byId[id])
            )
          );
          if (ids.length) groups.push({ label: loc.name, ids });
        }

        setLocGroups(groups);
        setGroupsError(null);
      } catch (e: any) {
        console.error("[EMBED] Error cargando agrupaciones:", e);
        setGroupsError(String(e?.message || e));
        setLocGroups([]);
      } finally {
        setGroupsLoading(false);
      }
    })();
  }, [configTick, nodes, byId]);

  return (
    <div className="w-full bg-slate-50">
      <style>{`
        @keyframes dash { to { stroke-dashoffset: -24; } }
        .flowing { stroke-dasharray: 4 8; animation: dash 1.4s linear infinite; opacity: 0.9; }
        text { user-select: none; }
      `}</style>

      {/* Header */}
      <div className="sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-white/60 bg-white/90 border-b border-slate-200">
        <div className="mx-auto max-w-[1600px] px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Layers3 className="h-5 w-5 text-slate-700" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={edit ? "default" : "outline"} onClick={() => setEdit((e) => !e)} title="Mover nodos">
              <Edit3 className="h-4 w-4" /> {edit ? "Editando" : "Editar"}
            </Button>
            <Button variant="outline" onClick={resetAuto} title="Auto layout">Auto</Button>
            <Button variant="outline" onClick={doExportJSON} title="Exportar layout">Exportar</Button>
            <input ref={importInputRef} type="file" accept="application/json" className="hidden"
                   onChange={(e) => { const f = e.target.files?.[0]; if (f) doImportJSON(f); e.currentTarget.value = ""; }} />
            <Button variant="outline" onClick={() => importInputRef.current?.click()} title="Importar layout">Importar</Button>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div className="mx-auto max-w-[1600px] px-6 py-6">
        <div className="rounded-2xl bg-white p-4 shadow-sm border border-slate-200">
          <div className="mb-3 flex flex-wrap items-center justify-center gap-4">
            <Legend />
            {edit && <div className="text-sm text-emerald-700 font-medium">Modo edición</div>}
          </div>

          <div className="relative w-full overflow-hidden rounded-xl border border-slate-200">
            <svg
              ref={svgRef}
              viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
              className="w-full"
              style={{ height: "720px", touchAction: "none" }}
              onAuxClick={preventMiddleAux}
              onPointerDown={onSvgPointerDown}
              onPointerMove={onSvgPointerMove}
              onPointerUp={onSvgPointerUp}
              onPointerCancel={onSvgPointerCancel}
              onDoubleClick={fitToContent}
            >
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" className="fill-current text-slate-400" />
                </marker>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e5e7eb" strokeWidth="1" />
                </pattern>
              </defs>

              {/* fondo cuadriculado grande */}
              <rect
                x={vb.x - vb.w * 5}
                y={vb.y - vb.h * 5}
                width={vb.w * 10}
                height={vb.h * 10}
                fill="url(#grid)"
                onAuxClick={preventMiddleAux}
              />

              {/* Agrupaciones automáticas desde backend */}
              {locGroups.map((g) => (
                <AutoGroupBox key={g.label} ids={g.ids} label={g.label} byId={byId} pad={102} />
              ))}
              {groupsLoading && (
                <g><text x={vb.x + 12} y={vb.y + 24} className="fill-slate-400 text-[12px]">Cargando agrupaciones…</text></g>
              )}
              {groupsError && (
                <g><text x={vb.x + 12} y={vb.y + 24} className="fill-red-500 text-[12px]">Error agrupaciones: {groupsError}</text></g>
              )}

              {/* Edges debajo */}
             {edges.map((e) => {
  const A = byId[e.a]; const B = byId[e.b];
  if (!A || !B) return null;
  if (![A.x, A.y, B.x, B.y].every((v) => Number.isFinite(v))) return null;

  const active = isEdgeActive(A, B); // 👈 usa los helpers nuevos

  return (
    <Edge
      key={`${e.a}-${e.b}-${tick}`}
      {...e}
      active={active}
      // opcional: si tu Edge muestra etiqueta centrada solo con A/B, podés pasar:
      // A={A} B={B}
    />
  );
})}


              {/* Nodes + overlay draggable (pintados con color de /tanks/status si aplica) */}
              {nodesWithStatus.map((n) => {
                const elem =
                  n.type === "tank" ? (
                    <Tank key={n.id} n={n} />
                  ) : n.type === "pump" ? (
                    <Pump key={n.id} n={n} />
                  ) : n.type === "valve" ? (
                    <Valve key={n.id} n={n} />
                  ) : n.type === "manifold" ? (
                    <Manifold key={n.id} n={n} />
                  ) : null;
                return (
                  <g key={`wrap-${n.id}`}>
                    {elem}
                    <DraggableOverlay id={n.id} />
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================
   Tipos para infra backend (agrupaciones)
   ============================ */
type InfraLocation = { id: number; code: string; name: string };
type InfraAssetItem = { id: number; name?: string; code?: string };
type InfraAssetGroup = { type: "tank" | "pump" | "valve" | "manifold"; items: InfraAssetItem[] };
