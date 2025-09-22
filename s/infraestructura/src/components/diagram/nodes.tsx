// src/components/diagram/nodes.tsx
// -------------------------------------------------------------
// Componentes de nodos para el diagrama (tanques, bombas, válvulas, etc.)
// - GroupBox: caja decorativa para agrupar elementos
// - AutoGroupBox: calcula bounding box de un grupo de ids y dibuja GroupBox
// - Tank: render del tanque (con nivel y color de estado desde /tanks/status)
// - Pump: render de bomba (estilo mejorado, con aro de estado y animación suave en ON)
// - Valve: render de válvula (indicador de estado)
// - Manifold: colectora simple
// -------------------------------------------------------------

import React from 'react'
import type { NodeBase } from '@/types/graph' // ⬅️ tipos compartidos



/* Indicador de presencia (ok/warn/bad) */
function PresenceDot({ x, y, tone }: { x: number; y: number; tone?: string }) {
  const fill = tone === "ok" ? "#10b981" : tone === "warn" ? "#f59e0b" : "#ef4444";
  return (
    <g>
      <circle cx={x} cy={y} r={6} fill="white" />
      <circle cx={x} cy={y} r={5} fill={fill} />
      {/* <title>{tone}</title>  // descomenta si querés tooltip */}
    </g>
  );
}


/* =============================================================
 * 1) GroupBox — Caja decorativa estática (usa coordenadas ya dadas)
 * ============================================================= */
export function GroupBox({
  x, y, w, h, label,
}: { x:number; y:number; w:number; h:number; label:string }) {
  return (
    <g className="loc-group" pointerEvents="none">
      {/* Fondo sutil */}
      <rect
        x={x} y={y} width={w} height={h} rx={14}
        className="fill-slate-50 stroke-slate-200"
        pointerEvents="none"
      />
      {/* Borde punteado */}
      <rect
        x={x} y={y} width={w} height={h} rx={14}
        fill="none" className="stroke-slate-300" strokeDasharray="6 6"
        pointerEvents="none"
      />
      {/* Etiqueta */}
      <text
        x={x + 12} y={y + 20}
        className="fill-slate-500 text-[12px]"
        pointerEvents="none"
      >
        {label}
      </text>
    </g>
  )
}

/* =============================================================
 * 2) AutoGroupBox — Calcula caja que engloba a los nodos indicados
 *    - ids: lista de ids a agrupar
 *    - byId: diccionario actual (id -> NodeBase) del render
 *    - pad: margen interno uniforme
 *    - grow: expansión opcional por lado
 * ============================================================= */
export function AutoGroupBox({
  ids, label, byId, pad = 28, grow = { left: 0, right: 0, top: 0, bottom: 0 },
}: {
  ids: string[]
  label: string
  byId: Record<string, NodeBase>
  pad?: number
  grow?: { left?: number; right?: number; top?: number; bottom?: number }
}) {
  const pts = ids.map(id => byId[id]).filter(Boolean) as NodeBase[]
  if (!pts.length) return null

  const xs = pts.map(p => p.x)
  const ys = pts.map(p => p.y)

  const minX = Math.min(...xs) - pad - (grow.left ?? 0)
  const maxX = Math.max(...xs) + pad + (grow.right ?? 0)
  const minY = Math.min(...ys) - pad - (grow.top ?? 0)
  const maxY = Math.max(...ys) + pad + (grow.bottom ?? 0)

  const w = maxX - minX
  const h = maxY - minY

  return <GroupBox x={minX} y={minY} w={w} h={h} label={label} />
}

/* =============================================================
 * 3) Tank — Tanque con nivel y color de estado
 *    - Usa n.tank_color_hex (vía /tanks/status) como borde
 *    - Dibuja el nivel (0..1) sobre cubeta interna
 * ============================================================= */
// Helper chico para mostrar capacidad linda (ej. 1.8k m³)
function fmtCap(v?: number | null) {
  if (v == null || !Number.isFinite(v)) return '—'
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`
  return String(v)
}

export function Tank({ n }: { n: NodeBase }) {
  const level = (() => {
  const v = n.level ?? 0;
  return v > 1 ? Math.max(0, Math.min(100, v)) / 100
               : Math.max(0, Math.min(1, v));
})();

  const stroke = n.tank_color_hex || '#94a3b8' // color desde /tanks/status (fallback gris)

  // ids únicos por nodo para gradientes/máscaras
  const gid = (suffix: string) => `tank-${n.id}-${suffix}`

  // Geometría base
  const outerW = 132
  const outerH = 96
  const outerRX = 16

  const innerW = 100
  const innerH = 60
  const innerRX = 10

  // Top-left de cada rect
  const outerX = n.x - outerW / 2
  const outerY = n.y - outerH / 2
  const innerX = n.x - innerW / 2
  const innerY = n.y - innerH / 2

  // Altura de la columna de nivel
  const levelH = innerH * level
  const levelY = innerY + (innerH - levelH)

  // Colorcito del chip de estado (si viene)
  const statusFill = stroke

  return (
    <g>
      {/* Sombra suave */}
      <ellipse cx={n.x} cy={outerY + outerH + 8} rx={outerW * 0.32} ry={8} className="fill-black/5" />

      {/* Defs: gradientes y máscara */}
      <defs>
        {/* Gradiente del chasis (metal/plástico) */}
        <linearGradient id={gid('body')} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"  stopColor="#ffffff" />
          <stop offset="60%" stopColor="#f1f5f9" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>

        {/* Brillo diagonal del borde */}
        <linearGradient id={gid('stroke')} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor={stroke} stopOpacity="1" />
          <stop offset="100%" stopColor={stroke} stopOpacity=".7" />
        </linearGradient>

        {/* Agua */}
        <linearGradient id={gid('water')} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor="#7dd3fc" />   {/* sky-300 */}
          <stop offset="100%" stopColor="#38bdf8" />   {/* sky-400 */}
        </linearGradient>

        {/* Gloss (reflejo) */}
        <linearGradient id={gid('gloss')} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity=".7" />
          <stop offset="60%"  stopColor="#ffffff" stopOpacity=".15" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>

        {/* Máscara para que el nivel respete las esquinas redondeadas del inner */}
        <mask id={gid('inner-mask')}>
          <rect x={innerX} y={innerY} width={innerW} height={innerH} rx={innerRX} ry={innerRX} fill="#fff" />
        </mask>
      </defs>

      {/* Cuerpo externo con borde coloreado por estado */}
      <rect
        x={outerX} y={outerY} width={outerW} height={outerH} rx={outerRX}
        fill={`url(#${gid('body')})`}
        stroke={`url(#${gid('stroke')})`}
        strokeWidth={2}
      />

      {/* Cubeta interna (gris muy claro) */}
      <rect
        x={innerX} y={innerY} width={innerW} height={innerH} rx={innerRX}
        className="stroke-slate-300"
        fill="#f8fafc"
      />

      {/* Columna de agua (recortada por máscara) */}
      <g mask={`url(#${gid('inner-mask')})`}>
        <rect
          x={innerX} y={levelY} width={innerW} height={levelH}
          fill={`url(#${gid('water')})`}
        />
        {/* Línea de superficie */}
        <rect x={innerX} y={levelY - 1} width={innerW} height={2} className="fill-white/60" />
        {/* Gloss vertical sutil encima del agua */}
        <rect x={innerX} y={innerY} width={innerW} height={innerH} fill={`url(#${gid('gloss')})`} />
      </g>

      {/* Etiquetas */}
      <text x={n.x} y={outerY - 10} textAnchor="middle" className="fill-slate-800 text-[12px] font-semibold">
        {n.name}
      </text>

      {/* Porcentaje dentro de la cubeta (centrado) */}
      <text x={n.x} y={n.y + 4} textAnchor="middle" className="fill-slate-700 text-[12px] font-semibold">
        {(level * 100).toFixed(0)}%
      </text>

      {/* Pie con capacidad */}
      <text x={n.x} y={outerY + outerH + 24} textAnchor="middle" className="fill-slate-600 text-[11px]">
        Cap. {fmtCap(n.capacity)} m³
      </text>

      {/* Chip estado (si hay) */}
      {n.tank_status && (
        <g>
          <rect x={outerX + outerW - 22} y={outerY + 6} width={16} height={8} rx={3} fill={statusFill} />
          <circle cx={outerX + outerW - 14} cy={outerY + 10} r={2} className="fill-white" />
        </g>
      )}
    </g>
  )
}


/* =============================================================
 * 4) Pump — Bomba (estilo mejorado)
 *    - Aro de estado (verde/ámbar/rojo/gris)
 *    - Glow y rotor con rotación suave cuando está ON
 *    - Sombra/base + etiquetas limpias
 * ============================================================= */
function pumpColors(status: NodeBase['status']) {
  switch (status) {
    case 'on':
      return { ring: 'stroke-emerald-500', glow: 'fill-emerald-400/25', body: 'fill-emerald-50', icon: 'stroke-emerald-700' }
    case 'standby':
      return { ring: 'stroke-amber-500', glow: 'fill-amber-400/20', body: 'fill-amber-50', icon: 'stroke-amber-700' }
    case 'fault':
      return { ring: 'stroke-rose-600', glow: 'fill-rose-500/20', body: 'fill-rose-50', icon: 'stroke-rose-700' }
    default:
      return { ring: 'stroke-slate-400', glow: 'fill-transparent', body: 'fill-slate-50', icon: 'stroke-slate-600' }
  }
}

export function Pump({ n }: { n: NodeBase }) {
  const s = n.status ?? 'unknown'
  const { ring, glow, body, icon } = pumpColors(s)
  const gid = (suffix: string) => `grad-${n.id}-${suffix}`

  return (
    <g>
      <title>{s === 'on' ? 'Bomba ENCENDIDA' : 'Bomba APAGADA'}</title>
      {/* Glow al estar ON */}
      {s === 'on' && <circle cx={n.x} cy={n.y} r={36} className={glow} />}

      {/* Gradiente sutil del cuerpo */}
      <defs>
        <radialGradient id={gid('pump')} cx="50%" cy="45%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e5e7eb" />
        </radialGradient>
      </defs>

      {/* Sombra/base */}
      <ellipse cx={n.x} cy={n.y + 24} rx={30} ry={8} className="fill-black/5" />

      {/* Cuerpo rectangular con esquinas redondeadas */}
      <rect x={n.x - 32} y={n.y - 24} width={64} height={48} rx={12} className="stroke-slate-300" fill={`url(#${gid('pump')})`} />

      {/* Voluta frontal */}
      <circle cx={n.x} cy={n.y} r={22} className={`${body} stroke-slate-300`} />

      {/* Aro de estado */}
      <circle cx={n.x} cy={n.y} r={22} className={`${ring}`} strokeWidth={3} fill="none" />

      {/* Rotor (3 palas) con rotación cuando ON */}
      <g
        className={s === 'on' ? 'animate-[spin_2.2s_linear_infinite]' : ''}
        style={{ transformOrigin: `${n.x}px ${n.y}px` }}
      >
        <path d={`M ${n.x} ${n.y-12} l 6 10 a 12 12 0 0 1 -12 0 z`} className={`${icon} fill-white`} strokeWidth={1} />
        <path d={`M ${n.x+12} ${n.y} l -10 6 a 12 12 0 0 1 0 -12 z`} className={`${icon} fill-white`} strokeWidth={1} />
        <path d={`M ${n.x} ${n.y+12} l -6 -10 a 12 12 0 0 1 12 0 z`} className={`${icon} fill-white`} strokeWidth={1} />
      </g>

      {/* Conexiones decorativas */}
      <rect x={n.x + 24} y={n.y - 6} width={16} height={12} rx={3} className="fill-white stroke-slate-300" />
      <rect x={n.x - 40} y={n.y - 4} width={14} height={8}  rx={2} className="fill-white stroke-slate-300" />

      {/* Indicador mini (esquina) */}
      <circle cx={n.x + 32} cy={n.y - 28} r={6} className={`${ring} fill-current`} />

      {/* Etiquetas */}
      <text x={n.x} y={n.y + 40} textAnchor="middle" className="fill-slate-800 text-[12px] font-semibold">
        {n.name}
      </text>
      <text x={n.x} y={n.y + 56} textAnchor="middle" className="fill-slate-600 text-[11px]">
        {Number.isFinite(n.kW) ? `${n.kW} kW` : '—'}
      </text>
    </g>
  )
}

/* =============================================================
 * 5) Valve — Válvula con estado (open/closed/throttle)
 * ============================================================= */
export function Valve({ n }: { n: NodeBase }) {
  const color =
    n.state === 'open'    ? 'fill-emerald-500' :
    n.state === 'closed'  ? 'fill-rose-600'    :
    /* throttle / otros */  'fill-amber-500'

  return (
    <g>
      <rect x={n.x - 16} y={n.y - 10} width={32} height={20} rx={4} className="fill-white stroke-slate-300" />
      <circle cx={n.x} cy={n.y} r={7} className={`stroke-white ${color}`} />
      <text x={n.x} y={n.y + 26} textAnchor="middle" className="fill-slate-700 text-[11px]">
        {n.name} • {n.state}
      </text>
    </g>
  )
}

/* =============================================================
 * 6) Manifold — Colectora simple
 * ============================================================= */
export function Manifold({ n }: { n: NodeBase }) {
  return (
    <g>
      <rect x={n.x - 50} y={n.y - 8} width={100} height={16} rx={6} className="fill-slate-200 stroke-slate-300" />
      <text x={n.x} y={n.y - 14} textAnchor="middle" className="fill-slate-600 text-[11px]">
        {n.name}
      </text>
    </g>
  )
}
