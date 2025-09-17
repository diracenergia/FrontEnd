// src/App.tsx
import React, { useEffect, useRef, useState } from "react";
import { Layers3, Play, Info, Edit3, RotateCcw, Maximize2 } from "lucide-react";

import Button from "@/components/ui/Button";
import Legend from "@/components/Legend";
import { NODES, SCENARIOS, byId, BASE_NODES } from "@/data/graph";
import useEdgesForScenario from "@/hooks/useEdgesForScenario";
import Edge from "@/components/diagram/Edge";
import { Tank, Pump, Valve, Manifold, AutoGroupBox } from "@/components/diagram/nodes";
import useDragNode from "@/hooks/useDragNode";
import { nodeHalfSize } from "@/utils/nodeDims";
import { computeAutoLayout } from "@/layout/auto";
import {
  exportLayout,
  importLayout,
  saveLayoutToStorage,
  loadLayoutFromStorage,
} from "./layout/layoutIO";

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

// 3) Handshake con el padre: el iframe pide config y acepta recibirla
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
   Helpers de configuración (sin lib/api)
   ============================ */
function envAny(): any {
  return (import.meta as any)?.env ?? {};
}
function trimSlash(s: string) {
  return String(s || "").replace(/\/+$/, "");
}
function ensureInfraBase(httpBase: string) {
  const base = trimSlash(httpBase);
  return base.endsWith("/infra") ? base : `${base}/infra`;
}
// === reemplazar estas helpers ===
function getHttpDefault(): string {
  // Si estamos en dev de Vite (5173/5174/5175), forzamos backend local
  const origin = typeof window !== "undefined" ? trimSlash(window.location.origin) : "";
  const isViteDev = /^http:\/\/(localhost|127\.0\.0\.1):517\d$/i.test(origin);
  if (isViteDev) {
    console.warn("[EMBED][WARN] Origin parece un dev-server de Vite:", origin, " → usando backend http://127.0.0.1:8000");
    return "http://127.0.0.1:8000";
  }
  // Si no es Vite dev, dejamos el origin (útil en prod cuando front y back comparten host)
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
    console.warn("[EMBED][WARN] La base apunta al dev-server de Vite:", finalBase, " → esto dará 404. Configurá api_base o VITE_API_URL.");
  }
  return finalBase;
}

/** API Key (ENV > LS > sin fallback) */
function getApiKey(): string {
  const e = envAny();
  const envKey = String(e?.VITE_API_KEY || "");
  const lsKey  = typeof localStorage !== "undefined" ? String(localStorage.getItem("apiKey") || "") : "";
  const key = envKey || lsKey || "";
  if (!key) {
    console.warn("[EMBED][WARN] API Key ausente. En tests podés pasarla por ?api_key=... o via postMessage EMBED_CONFIG.");
  }
  return key;
}

/** Org Id (ENV > LS > default "1" como en lib/api.ts) */
function getOrgId(): string {
  const e = envAny();
  const raw =
    e?.VITE_ORG_ID ??
    (typeof localStorage !== "undefined" ? localStorage.getItem("orgId") : null);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? String(n) : "1";
}
/** Headers comunes para backend */
function infraHeaders(): HeadersInit {
  const h: Record<string, string> = { Accept: "application/json" };
  const key = getApiKey();
  if (key) {
    h["X-API-Key"] = key;
    h["Authorization"] = `Bearer ${key}`; // compat
  }
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

/* ============================
   Utils de UI
   ============================ */
const preventMiddleAux: React.MouseEventHandler<any> = (e) => {
  if ((e as any).button === 1) {
    e.preventDefault();
    e.stopPropagation();
  }
};

type ViewBox = { x: number; y: number; w: number; h: number };

function nodesBBox(nodes = NODES) {
  let minX = +Infinity,
    minY = +Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const n of nodes) {
    const { halfW, halfH } = nodeHalfSize(n.type);
    minX = Math.min(minX, n.x - halfW);
    minY = Math.min(minY, n.y - halfH);
    maxX = Math.max(maxX, n.x + halfW);
    maxY = Math.max(maxY, n.y + halfH);
  }
  const pad = 120;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

export default function App() {
  const [scenario, setScenario] = useState<keyof typeof SCENARIOS>("Normal");
  const [edit, setEdit] = useState(false);
  const [tick, setTick] = useState(0);
  const edges = useEdgesForScenario(scenario);

  // escucha cambios de config (cuando el host manda EMBED_CONFIG)
  const [configTick, setConfigTick] = useState(0);
  useEffect(() => {
    const onCfg = () => {
      console.log("[EMBED] Config actualizada, reintentando cargas…");
      setConfigTick((t) => t + 1);
    };
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
    return () => {
      ro.disconnect();
      window.removeEventListener("load", reportHeight);
    };
  }, []);

  // --------------------------
  // ViewBox (pan & zoom)
  // --------------------------
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [vb, setVb] = useState<ViewBox>(() => {
    const bb = nodesBBox();
    return { x: bb.minX, y: bb.minY, w: bb.w, h: bb.h };
  });
  const vbRef = useRef(vb);
  vbRef.current = vb;

  const rafRef = useRef<number | null>(null);
  const scheduleTick = () => {
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(() => {
        setTick((t) => t + 1);
        rafRef.current = null;
      });
    }
  };

  const fitToContent = () => {
    const bb = nodesBBox();
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
    const loaded = loadLayoutFromStorage();
    if (loaded) scheduleTick();
    fitToContent();

    const svg = svgRef.current;
    if (!svg) return;

    const onWheelNative = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomBy(e.deltaY, e.clientX, e.clientY);
      }
    };
    svg.addEventListener("wheel", onWheelNative, { passive: false });

    const ro = new ResizeObserver(() => fitToContent());
    const host = svg.parentElement;
    if (host) ro.observe(host);

    return () => {
      svg.removeEventListener("wheel", onWheelNative);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --------------------------
  // Pan con ruedita PRESIONADA
  // --------------------------
  const panning = useRef({
    active: false,
    start: { x: 0, y: 0 },
    vb0: { x: 0, y: 0, w: 0, h: 0 } as ViewBox,
  });

  function startPan(e: React.PointerEvent) {
    const svg = svgRef.current!;
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
    panning.current.active = true;
    panning.current.start = { x: e.clientX, y: e.clientY };
    panning.current.vb0 = vbRef.current;
  }

  function movePan(e: React.PointerEvent) {
    if (!panning.current.active) return;
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const dxClient = e.clientX - panning.current.start.x;
    const dyClient = e.clientY - panning.current.start.y;
    const sx = vbRef.current.w / rect.width;
    const sy = vbRef.current.h / rect.height;
    const nx = panning.current.vb0.x - dxClient * sx;
    const ny = panning.current.vb0.y - dyClient * sy;
    setVb((prev) => ({ ...prev, x: nx, y: ny }));
  }

  function endPan(e: React.PointerEvent) {
    const svg = svgRef.current!;
    try {
      svg.releasePointerCapture(e.pointerId);
    } catch {}
    panning.current.active = false;
  }

  const onSvgPointerDown: React.PointerEventHandler<SVGSVGElement> = (e) => {
    if (e.button === 1) startPan(e);
  };
  const onSvgPointerMove: React.PointerEventHandler<SVGSVGElement> = (e) => movePan(e);
  const onSvgPointerUp: React.PointerEventHandler<SVGSVGElement> = (e) => endPan(e);
  const onSvgPointerCancel: React.PointerEventHandler<SVGSVGElement> = (e) => endPan(e);

  // --------------------------
  // Overlay draggable por nodo
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
        byId[id].x = x;
        byId[id].y = y;
        scheduleTick();
      },
      snap: 10,
      onEnd: () => {
        saveLayoutToStorage();
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
          onPointerDown={(e) => {
            setPressed(true);
            drag.onPointerDown(e as any);
          }}
          onPointerUp={(e) => {
            setPressed(false);
            drag.onPointerUp(e as any);
          }}
          onPointerCancel={(e) => {
            setPressed(false);
            drag.onPointerUp(e as any);
          }}
          onContextMenu={(e) => e.preventDefault()}
          onAuxClick={(e) => {
            if ((e as any).button === 1) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        />
      </g>
    );
  };

  // --------------------------
  // Reset / Export / Import
  // --------------------------
  function resetAuto() {
    const fresh = computeAutoLayout(BASE_NODES);
    for (const f of fresh) {
      if (byId[f.id]) {
        byId[f.id].x = f.x;
        byId[f.id].y = f.y;
      }
    }
    saveLayoutToStorage();
    scheduleTick();
    fitToContent();
  }

  function doExportJSON() {
    const data = exportLayout();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "layout-acueducto.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  function doImportJSON(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const arr = JSON.parse(String(reader.result));
        importLayout(arr);
        saveLayoutToStorage();
        scheduleTick();
        fitToContent();
      } catch {
        alert("Archivo inválido");
      }
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
    console.group("[EMBED] Cargando agrupaciones");
    console.log("API_INFRA:", API_INFRA);
    console.groupEnd();

    setGroupsLoading(true);
    (async () => {
      try {
        const locs = await fetchJSON<InfraLocation[]>(`${API_INFRA}/locations`);
        const groups: Array<{ label: string; ids: string[] }> = [];

        for (const loc of locs) {
          const assets = await fetchJSON<InfraAssetGroup[]>(`${API_INFRA}/locations/${loc.id}/assets`);
          const ids = Array.from(
            new Set(
              assets
                .flatMap((g) => g.items.map((a) => a.code || ""))
                .filter((code) => !!code && (byId as any)[code])
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
  }, [configTick]);

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
            {Object.keys(SCENARIOS).map((name) => (
              <Button
                key={name}
                variant={scenario === (name as any) ? "default" : "outline"}
                onClick={() => setScenario(name as any)}
                title={`Escenario: ${name}`}
              >
                <Play className="h-4 w-4" /> {name}
              </Button>
            ))}
            <Button variant={edit ? "default" : "outline"} onClick={() => setEdit((e) => !e)} title="Mover nodos">
              <Edit3 className="h-4 w-4" /> {edit ? "Editando" : "Editar"}
            </Button>
            <Button variant="outline" onClick={fitToContent} title="Encajar todo (doble click en el lienzo)">
              <Maximize2 className="h-4 w-4" /> Fit
            </Button>
            <Button variant="ghost" onClick={resetAuto} title="Recalcular posiciones automáticamente">
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
            <Button variant="outline" onClick={doExportJSON} title="Exportar posiciones a JSON">
              Exportar
            </Button>
            <label className="inline-flex">
              <input
                ref={importInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0];
                  if (f) doImportJSON(f);
                  e.currentTarget.value = "";
                }}
              />
              <Button variant="outline" title="Importar posiciones desde JSON" onClick={() => importInputRef.current?.click()}>
                Importar
              </Button>
            </label>
            <Button variant="ghost" title="Sólo demo visual, datos hardcodeados">
              <Info className="h-4 w-4" /> Demo
            </Button>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div className="mx-auto max-w-[1600px] px-6 py-6">
        <div className="rounded-2xl bg-white p-4 shadow-sm border border-slate-200">
          <div className="mb-3 flex items-center justify-between">
            <Legend />
            <div className="text-sm text-slate-600">
              Escenario: <span className="font-medium text-slate-900">{scenario}</span>
              {edit && <span className="ml-3 text-emerald-700 font-medium">Modo edición</span>}
              <span className="ml-3 text-slate-400">
                Ctrl/⌘ + rueda = Zoom • Ruedita presionada = Pan • Doble clic = Fit
              </span>
            </div>
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

              {/* Agrupaciones automáticas DESDE BACKEND */}
              {locGroups.map((g) => (
                <AutoGroupBox key={g.label} ids={g.ids} label={g.label} pad={102} />
              ))}
              {groupsLoading && (
                <g>
                  <text x={vb.x + 12} y={vb.y + 24} className="fill-slate-400 text-[12px]">
                    Cargando agrupaciones…
                  </text>
                </g>
              )}
              {groupsError && (
                <g>
                  <text x={vb.x + 12} y={vb.y + 24} className="fill-red-500 text-[12px]">
                    Error agrupaciones: {groupsError}
                  </text>
                </g>
              )}

              {/* Edges debajo */}
              {edges.map((e) => {
                const A = byId[e.a];
                const B = byId[e.b];
                if (!A || !B) return null;
                if (![A.x, A.y, B.x, B.y].every((v) => Number.isFinite(v))) return null;
                return <Edge key={`${e.a}-${e.b}-${tick}`} {...e} />;
              })}

              {/* Nodes + overlay draggable */}
              {NODES.map((n) => {
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
   Tipos para infra backend
   ============================ */
type InfraLocation = { id: number; code: string; name: string };
type InfraAssetItem = { id: number; name?: string; code?: string };
type InfraAssetGroup = { type: "tank" | "pump" | "valve" | "manifold"; items: InfraAssetItem[] };
