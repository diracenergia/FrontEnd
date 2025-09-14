// src/pages/General/GeneralPage.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Layers3, Play, Info, Edit3, RotateCcw, Activity, Gauge, AlertTriangle } from 'lucide-react'
import Button from '@/components/ui/Button'
import Legend from '@/components/Legend'
import { NODES as NODES_INIT, SCENARIOS, byId, BASE_NODES } from '@/data/graph'
import useEdgesForScenario from '@/hooks/useEdgesForScenario'
import Edge from '@/components/diagram/Edge'
import { Tank, Pump, Valve, Manifold, AutoGroupBox } from '@/components/diagram/nodes'
import useDragNode from '@/hooks/useDragNode'
import { nodeHalfSize } from '@/utils/nodeDims'
import { computeAutoLayout } from '@/layout/auto'
import { exportLayout, importLayout, saveLayoutToStorage, loadLayoutFromStorage } from '@/utils/layoutIO'

type Viewport = { x: number; y: number; k: number }
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

export default function GeneralPage() {
  const [scenario, setScenario] = useState<keyof typeof SCENARIOS>('Normal')
  const [edit, setEdit] = useState(false)
  const [tick, setTick] = useState(0) // re-render (edges / group boxes)
  const [vp, setVp] = useState<Viewport>({ x: 0, y: 0, k: 1 })
  const svgRef = useRef<SVGSVGElement | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const edges = useEdgesForScenario(scenario)

  // Cargar layout guardado y fit inicial
  useEffect(() => {
    loadLayoutFromStorage()
    setTick(t => t + 1)
    fitView()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // rAF gate para evitar spams de renders durante drag
  const rafRef = useRef<number | null>(null)
  const scheduleTick = () => {
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(() => {
        setTick(t => t + 1)
        rafRef.current = null
      })
    }
  }

  // Export / Import
  function doExportJSON() {
    const data = exportLayout()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'layout-acueducto.json'
    a.click()
    URL.revokeObjectURL(url)
  }
  function doImportJSON(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const arr = JSON.parse(String(reader.result))
        importLayout(arr)
        saveLayoutToStorage()
        setTick(t => t + 1)
        fitView()
      } catch {
        alert('Archivo inválido')
      }
    }
    reader.readAsText(file)
  }

  // Overlay draggable por nodo (activo solo en modo edición)
  const DraggableOverlay: React.FC<{ id: string }> = ({ id }) => {
    const n = byId[id]
    const { halfW, halfH } = nodeHalfSize(n?.type ?? 'tank')
    const [pressed, setPressed] = useState(false)
    const drag = useDragNode({
      id,
      enabled: edit,
      snap: 10,
      debug: false,
      onChange: () => {
        saveLayoutToStorage()
        scheduleTick()
      },
      onEnd: () => setPressed(false),
    })
    const x = (n.x - halfW) - 8
    const y = (n.y - halfH) - 8
    const w = (halfW * 2) + 16
    const h = (halfH * 2) + 16

    return (
      <g>
        {pressed && (
          <rect x={x-3} y={y-3} width={w+6} height={h+6} rx={10}
                fill="none" stroke="rgb(56 189 248)" strokeWidth={2} pointerEvents="none" />
        )}
        <rect
          x={x} y={y} width={w} height={h} rx={8}
          fill="black" fillOpacity={0.04}
          pointerEvents={edit ? ('all' as any) : ('none' as any)}
          stroke={edit ? (pressed ? 'rgb(56 189 248)' : 'rgb(203 213 225)') : 'none'}
          strokeWidth={edit ? 1.5 : 0}
          strokeDasharray={edit ? '4 4' : undefined}
          style={{ cursor: edit ? (pressed ? 'grabbing' : 'grab') : 'default' }}
          onPointerDown={(e) => { setPressed(true); drag.onPointerDown(e as any) }}
          onPointerMove={(e) => drag.onPointerMove(e as any)}
          onPointerUp={(e) => { setPressed(false); drag.onPointerUp(e as any) }}
          onPointerCancel={(e) => { setPressed(false); drag.onPointerUp(e as any) }}
          onLostPointerCapture={(e) => { setPressed(false); drag.onPointerUp(e as any) }}
          onContextMenu={(e) => e.preventDefault()}
        />
      </g>
    )
  }

  // Auto-layout reset
  function resetAuto() {
    const fresh = computeAutoLayout(BASE_NODES)
    for (const f of fresh) {
      if (byId[f.id]) { byId[f.id].x = f.x; byId[f.id].y = f.y }
    }
    saveLayoutToStorage()
    setTick(t => t + 1)
    fitView()
  }

  // ---------- PAN / ZOOM tipo CAD ----------
  const panning = useRef<{ id: number | null, lastX: number, lastY: number } | null>(null)

  function wheelZoom(e: React.WheelEvent<SVGSVGElement>) {
    if (!e.ctrlKey) return // si no está Ctrl, dejamos scroll de página
    e.preventDefault()
    const svg = svgRef.current!
    const pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const ctm = (svg.getScreenCTM() as DOMMatrix).inverse()
    const p = pt.matrixTransform(ctm)

    const delta = -e.deltaY
    const factor = Math.exp(delta * 0.0015)
    const k = clamp(vp.k * factor, 0.25, 4)

    // zoom hacia el puntero
    const nx = p.x - (p.x - vp.x) * (k / vp.k)
    const ny = p.y - (p.y - vp.y) * (k / vp.k)
    setVp({ x: nx, y: ny, k })
  }

  function onPointerDownCanvas(e: React.PointerEvent<SVGSVGElement>) {
    // Botón central = pan mientras esté presionado
    if (e.button === 1) {
      e.preventDefault()
      const id = e.pointerId
      panning.current = { id, lastX: e.clientX, lastY: e.clientY }
      ;(e.target as Element).setPointerCapture(id)
    }
  }
  function onPointerMoveCanvas(e: React.PointerEvent<SVGSVGElement>) {
    if (!panning.current || panning.current.id !== e.pointerId) return
    const dx = (e.clientX - panning.current.lastX) / vp.k
    const dy = (e.clientY - panning.current.lastY) / vp.k
    panning.current.lastX = e.clientX
    panning.current.lastY = e.clientY
    setVp(v => ({ ...v, x: v.x + dx, y: v.y + dy }))
  }
  function onPointerUpCanvas(e: React.PointerEvent<SVGSVGElement>) {
    if (panning.current && panning.current.id === e.pointerId) {
      panning.current = null
      try { (e.target as Element).releasePointerCapture(e.pointerId) } catch {}
    }
  }

  // Fit al contenido (usa bounding de todos los nodos)
  const NODES_ALL = useMemo(() => NODES_INIT, [])
  function fitView(pad = 40) {
    const xs = NODES_ALL.map(n => n.x)
    const ys = NODES_ALL.map(n => n.y)
    if (!xs.length) return
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const w = (maxX - minX) + pad * 2
    const h = (maxY - minY) + pad * 2
    const vw = 1280, vh = 640
    const k = clamp(Math.min(vw / w, vh / h), 0.25, 4)
    const cx = minX - pad, cy = minY - pad
    setVp({ x: -cx, y: -cy, k })
  }
  function resetZoom() { setVp({ x: 0, y: 0, k: 1 }) }

  // Hotkeys: F (fit), 0 (100%), + / - con Ctrl simulado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') { e.preventDefault(); fitView() }
      if (e.key === '0') { e.preventDefault(); resetZoom() }
      if (e.key === '+') { e.preventDefault(); wheelZoom(new WheelEvent('wheel', { deltaY: -120, ctrlKey: true })) }
      if (e.key === '-') { e.preventDefault(); wheelZoom(new WheelEvent('wheel', { deltaY: 120, ctrlKey: true })) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vp])

  return (
    <div className="min-h-screen w-full bg-slate-50">
      <style>{`
        @keyframes dash { to { stroke-dashoffset: -24; } }
        .flowing { stroke-dasharray: 4 8; animation: dash 1.4s linear infinite; opacity: 0.9; }
        text { user-select: none; }
      `}</style>

      {/* Header */}
      <div className="sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-white/60 bg-white/90 border-b border-slate-200">
        <div className="mx-auto max-w-[1400px] px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Layers3 className="h-5 w-5 text-slate-700" />
            <h1 className="text-lg font-semibold text-slate-900">General — Vista SCADA (hardcode)</h1>
          </div>
          <div className="flex items-center gap-2">
            {Object.keys(SCENARIOS).map((name) => (
              <Button key={name} variant={scenario === name ? 'default' : 'outline'} onClick={() => setScenario(name as any)}>
                <Play className="h-4 w-4" /> {name}
              </Button>
            ))}
            <Button variant={edit ? 'default' : 'outline'} onClick={() => setEdit(e => !e)} title="Mover nodos">
              <Edit3 className="h-4 w-4" /> {edit ? 'Editando' : 'Editar'}
            </Button>
            <Button variant="ghost" onClick={resetAuto} title="Recalcular posiciones automáticamente">
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>

            <Button variant="outline" onClick={doExportJSON} title="Exportar posiciones a JSON">Exportar</Button>
            <label className="inline-flex">
              <input
                ref={importInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0]
                  if (f) doImportJSON(f)
                  e.currentTarget.value = ''
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

      {/* Lienzo + panel inferior */}
      <div className="mx-auto max-w-[1400px] px-6 py-6 space-y-6">

        {/* Canvas full width */}
        <div className="rounded-2xl bg-white p-4 shadow-sm border border-slate-200">
          <div className="mb-3 flex items-center justify-between">
            <Legend />
            <div className="text-sm text-slate-600">
              Escenario: <span className="font-medium text-slate-900">{scenario}</span>
              {edit && <span className="ml-3 text-emerald-700 font-medium">Modo edición</span>}
            </div>
          </div>

          <div className="relative w-full overflow-hidden rounded-xl border border-slate-200">
            <svg
              ref={svgRef}
              viewBox="0 0 1280 640"
              className="w-full h-[70vh] min-h-[560px] bg-white"
              style={{ touchAction: 'none' }}
              onWheel={wheelZoom}
              onPointerDown={onPointerDownCanvas}
              onPointerMove={onPointerMoveCanvas}
              onPointerUp={onPointerUpCanvas}
              onPointerCancel={onPointerUpCanvas}
            >
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" className="fill-current text-slate-400" />
                </marker>
              </defs>

              {/* Contenedor pan/zoom */}
              <g transform={`translate(${vp.x},${vp.y}) scale(${vp.k})`}>
                {/* Group boxes automáticos */}
                <AutoGroupBox ids={['P1','P2','P3','P4','P5','P6','P7','MC']} label="Planta" pad={36} grow={{ right: 30, top: 10, bottom: 14 }} />
                <AutoGroupBox ids={['TP','TA','P8','P9','MB']} label="Tanques principales" pad={34} grow={{ left: 12 }} />
                <AutoGroupBox ids={['TA1','TA2','TA3']} label="Tanques altos" pad={30} />
                <AutoGroupBox ids={['VG','TG']} label="Distribución por gravedad" pad={28} grow={{ right: 20 }} />

                {/* Edges debajo */}
                {edges.map((e) => (
                  <Edge key={`${e.a}-${e.b}-${tick}`} {...e} />
                ))}

                {/* Nodes + overlay draggable */}
                {NODES_INIT.map((n) => {
                  const elem =
                    n.type === 'tank' ? <Tank key={n.id} n={n} /> :
                    n.type === 'pump' ? <Pump key={n.id} n={n} /> :
                    n.type === 'valve' ? <Valve key={n.id} n={n} /> :
                    n.type === 'manifold' ? <Manifold key={n.id} n={n} /> : null
                  return (
                    <g key={`wrap-${n.id}`}>
                      {elem}
                      <DraggableOverlay id={n.id} />
                    </g>
                  )
                })}
              </g>
            </svg>
          </div>

          <div className="mt-3 text-sm text-slate-700">
            {SCENARIOS[scenario].note}
          </div>
        </div>

        {/* Panel inferior (lo que antes estaba a la derecha) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-slate-800 font-semibold">
              <Activity className="h-4 w-4" /> Estado de Bombas
            </div>
            <ul className="space-y-2 text-sm">
              {NODES_INIT.filter((n) => n.type === 'pump').map((p) => (
                <li key={p.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${p.status==='on'?'bg-emerald-500':p.status==='standby'?'bg-amber-500':p.status==='fault'?'bg-rose-600':'bg-slate-400'}`} />
                    {p.name}
                  </div>
                  <span className="text-slate-600">{p.kW} kW</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-slate-800 font-semibold"><Gauge className="h-4 w-4" /> Niveles de Tanque</div>
            <ul className="space-y-2 text-sm">
              {NODES_INIT.filter((n) => n.type === 'tank').map((t) => (
                <li key={t.id} className="flex items-center justify-between">
                  <span>{t.name}</span>
                  <span className="tabular-nums font-medium">{((t.level ?? 0) * 100).toFixed(0)}%</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-slate-800 font-semibold"><AlertTriangle className="h-4 w-4" /> Alarmas (demo)</div>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center justify-between">
                <span>P7 fuera de servicio</span>
                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs bg-rose-100 text-rose-700">Crítica</span>
              </li>
              <li className="flex items-center justify-between">
                <span>V-TA3 en estrangulación</span>
                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs bg-amber-100 text-amber-800">Atención</span>
              </li>
            </ul>
          </div>
        </div>

      </div>
    </div>
  )
}
