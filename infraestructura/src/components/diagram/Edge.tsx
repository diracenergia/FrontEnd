import React from 'react'
import type { NodeBase } from '@/types/graph'
import { orthogonalPath } from '@/utils/paths'

type Pipe = '8' | '10' | 'G'

export default function Edge({
  a, b, pipe, active, A, B,
}: {
  a: string
  b: string
  pipe?: Pipe
  active: boolean
  // Opcionales: si App los pasa, pintamos la etiqueta en el medio
  A?: NodeBase
  B?: NodeBase
}) {
  // La línea se dibuja SIEMPRE usando el path calculado por util (sin byId global)
  const path = orthogonalPath(a, b)

  const strokeWidth =
    pipe === '10' ? 4 :
    pipe === '8'  ? 3.5 :
    pipe === 'G'  ? 3   : 3

  const pipeLabel =
    pipe === '10' ? 'Ø10"' :
    pipe === '8'  ? 'Ø8"'  :
    pipe === 'G'  ? 'Gravedad' : ''

  // La etiqueta sólo si tenemos A y B (App puede no pasarlos)
  const showLabel = !!(pipeLabel && A && B)
  const mx = showLabel ? (A!.x + B!.x) / 2 : 0
  const my = showLabel ? (A!.y + B!.y) / 2 - 6 : 0

  return (
    <g>
      <path
        d={path}
        className={active ? 'stroke-sky-600 flowing' : 'stroke-slate-300'}
        style={{ strokeWidth, fill: 'none' }}
        markerEnd="url(#arrow)"
      />
      {showLabel && (
        <text x={mx} y={my} textAnchor="middle" className="fill-slate-500 text-[10px]">
          {pipeLabel}
        </text>
      )}
    </g>
  )
}
