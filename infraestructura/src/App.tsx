// src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Layers3,
  Play,
  Info,
  Activity,
  Gauge,
  AlertTriangle,
  Edit3,
  RotateCcw,
  Maximize2,
} from "lucide-react";

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

// --------------------------
// Utils
// --------------------------
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
  const [tick, setTick] = useState(0); // re-render (edges / group boxes)
  const edges = useEdgesForScenario(scenario);

  // --------------------------
  // ViewBox (pan & zoom state)
  // --------------------------
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [vb, setVb] = useState<ViewBox>(() => {
    const bb = nodesBBox();
    return { x: bb.minX, y: bb.minY, w: bb.w, h: bb.h };
  });
  const vbRef = useRef(vb);
  vbRef.current = vb;

  // rAF gate para reducir renders
  const rafRef = useRef<number | null>(null);
  const scheduleTick = () => {
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(() => {
        setTick((t) => t + 1);
        rafRef.current = null;
      });
    }
  };

  // fit to content (al montar y en doble click)
  const fitToContent = () => {
    const bb = nodesBBox();
    setVb({ x: bb.minX, y: bb.minY, w: bb.w, h: bb.h });
    console.log("[App] fitToContent →", { vb: { x: bb.minX, y: bb.minY, w: bb.w, h: bb.h } });
  };

  // helper para aplicar zoom centrado bajo el cursor
  function zoomBy(deltaY: number, clientX: number, clientY: number) {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const { x, y, w, h } = vbRef.current;

    const px = x + ((clientX - rect.left) / rect.width) * w;
    const py = y + ((clientY - rect.top) / rect.height) * h;

    const k = Math.pow(1.0015, deltaY); // deltaY>0 aleja, <0 acerca
    const nw = Math.max(200, Math.min(50000, w * k));
    const nh = Math.max(200, Math.min(50000, h * k));

    const nx = px - ((px - x) * nw) / w;
    const ny = py - ((py - y) * nh) / h;

    setVb({ x: nx, y: ny, w: nw, h: nh });
  }

  // Mount + listeners
  useEffect(() => {
    console.groupCollapsed("[App] mount");
    console.log("nodes", NODES.length, "edges", edges.length, "scenario", scenario);
    console.groupEnd();

    // cargar layout guardado (si existe)
    const loaded = loadLayoutFromStorage();
    if (loaded) {
      console.log("[App] layout cargado desde storage");
      scheduleTick();
    }

    // auto-fit inicial
    fitToContent();

    // listener nativo para Ctrl/⌘ + wheel (passive:false)
    const svg = svgRef.current;
    if (!svg) return;

    const onWheelNative = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault(); // evita zoom de la página
        zoomBy(e.deltaY, e.clientX, e.clientY);
      }
    };
    svg.addEventListener("wheel", onWheelNative, { passive: false });

    // re-fit al cambiar tamaño del contenedor (restaurar ventana)
    const ro = new ResizeObserver(() => {
      fitToContent();
    });
    const host = svg.parentElement;
    if (host) ro.observe(host);

    return () => {
      svg.removeEventListener("wheel", onWheelNative);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Log de cambios de escenario y edges
  useEffect(() => {
    console.groupCollapsed("[App] scenario change");
    console.log("scenario:", scenario);
    console.log("edges:", edges.length);
    console.groupEnd();
  }, [scenario, edges.length]);

  // Log de cambios de viewBox
  useEffect(() => {
    console.log("[App] viewBox", vb);
  }, [vb]);

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
    // Middle button = pan (sólo mientras presionado)
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
    const { halfW, halfH } = nodeHalfSize(n?.type ?? "tank");
    const [pressed, setPressed] = useState(false);

    const drag = useDragNode({
      id,
      enabled: edit,
      snap: 10,
      debug: false,
      onChange: () => {
        saveLayoutToStorage();
        scheduleTick();
      },
      onEnd: () => {
        setPressed(false);
        console.log("[Drag] end", id, "→", { x: byId[id].x, y: byId[id].y });
      },
    });

    const x = n.x - halfW - 8;
    const y = n.y - halfH - 8;
    const w = halfW * 2 + 16;
    const h = halfH * 2 + 16;

    const onDown: React.PointerEventHandler<SVGRectElement> = (e) => {
      // si es middle, no iniciamos drag del nodo -> lo toma el pan del SVG
      if (e.button === 1) return;
      setPressed(true);
      drag.onPointerDown(e as any);
      console.log("[Drag] start", id);
    };

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
          style={{ cursor: edit ? (pressed ? "grabbing" : "grab") : "default" }}
          onPointerDown={onDown}
          onPointerMove={(e) => drag.onPointerMove(e as any)}
          onPointerUp={(e) => {
            setPressed(false);
            drag.onPointerUp(e as any);
          }}
          onPointerCancel={(e) => {
            setPressed(false);
            drag.onPointerUp(e as any);
          }}
          onLostPointerCapture={() => setPressed(false)}
          onContextMenu={(e) => e.preventDefault()}
          onAuxClick={preventMiddleAux}
        />
      </g>
    );
  };

  // --------------------------
  // Reset de auto-layout
  // --------------------------
  function resetAuto() {
    console.log("[Layout] reset auto");
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

  // --------------------------
  // Export / Import
  // --------------------------
  function doExportJSON() {
    const data = exportLayout();
    console.log("[Layout] export JSON", data);
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
        console.log("[Layout] import OK", arr);
      } catch (err) {
        console.error("[Layout] import ERROR", err);
        alert("Archivo inválido");
      }
    };
    reader.readAsText(file);
  }
  const importInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="min-h-screen w-full bg-slate-50">
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
            <h1 className="text-lg font-semibold text-slate-900">Acuaducto — Vista General (hardcode)</h1>
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
              <Button
                variant="outline"
                title="Importar posiciones desde JSON"
                onClick={() => importInputRef.current?.click()}
              >
                Importar
              </Button>
            </label>
            <Button variant="ghost" title="Sólo demo visual, datos hardcodeados">
              <Info className="h-4 w-4" /> Demo
            </Button>
          </div>
        </div>
      </div>

      {/* Canvas + paneles abajo */}
      <div className="mx-auto max-w-[1600px] px-6 py-6 space-y-6">
        {/* Canvas */}
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
              className="w-full h-[72vh] bg-white"
              style={{ touchAction: "none" }}
              onAuxClick={preventMiddleAux}
              onPointerDown={onSvgPointerDown}
              onPointerMove={onSvgPointerMove}
              onPointerUp={onSvgPointerUp}
              onPointerCancel={onSvgPointerCancel}
              onDoubleClick={fitToContent}
            >
              <defs>
                <marker
                  id="arrow"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" className="fill-current text-slate-400" />
                </marker>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e5e7eb" strokeWidth="1" />
                </pattern>
              </defs>

              {/* fondo cuadriculado grande para pan infinito */}
              <rect
                x={vb.x - vb.w * 5}
                y={vb.y - vb.h * 5}
                width={vb.w * 10}
                height={vb.h * 10}
                fill="url(#grid)"
                onAuxClick={preventMiddleAux}
              />

              {/* Agrupaciones automáticas */}
              <AutoGroupBox
                ids={["P1", "P2", "P3", "P4", "P5", "P6", "P7", "MC"]}
                label="Planta"
                pad={36}
                grow={{ right: 30, top: 10, bottom: 14 }}
              />
              <AutoGroupBox
                ids={["TP", "TA", "P8", "P9", "MB"]}
                label="Tanques principales"
                pad={34}
                grow={{ left: 12 }}
              />
              <AutoGroupBox ids={["TA1", "TA2", "TA3"]} label="Tanques altos" pad={30} />
              <AutoGroupBox ids={["VG", "TG"]} label="Distribución por gravedad" pad={28} grow={{ right: 20 }} />

              {/* Edges debajo */}
              {edges.map((e) => (
                <Edge key={`${e.a}-${e.b}-${tick}`} {...e} />
              ))}

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

          <div className="mt-3 text-sm text-slate-700">{SCENARIOS[scenario].note}</div>
        </div>

        {/* Paneles abajo */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-slate-800 font-semibold">
              <Activity className="h-4 w-4" /> Estado de Bombas
            </div>
            <ul className="space-y-2 text-sm">
              {NODES.filter((n) => n.type === "pump").map((p) => (
                <li key={p.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block h-2.5 w-2.5 rounded-full ${
                        p.status === "on"
                          ? "bg-emerald-500"
                          : p.status === "standby"
                          ? "bg-amber-500"
                          : p.status === "fault"
                          ? "bg-rose-600"
                          : "bg-slate-400"
                      }`}
                    />
                    {p.name}
                  </div>
                  <span className="text-slate-600">{p.kW} kW</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-slate-800 font-semibold">
              <Gauge className="h-4 w-4" /> Niveles de Tanque
            </div>
            <ul className="space-y-2 text-sm">
              {NODES.filter((n) => n.type === "tank").map((t) => (
                <li key={t.id} className="flex items-center justify-between">
                  <span>{t.name}</span>
                  <span className="tabular-nums font-medium">{(((t.level ?? 0) * 100) | 0).toString()}%</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-slate-800 font-semibold">
              <AlertTriangle className="h-4 w-4" /> Alarmas (demo)
            </div>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center justify-between">
                <span>P7 fuera de servicio</span>
                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs bg-rose-100 text-rose-700">
                  Crítica
                </span>
              </li>
              <li className="flex items-center justify-between">
                <span>V-TA3 en estrangulación</span>
                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs bg-amber-100 text-amber-800">
                  Atención
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
