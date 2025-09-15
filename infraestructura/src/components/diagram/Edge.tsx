import React from 'react'
import { byId } from '@/data/graph'
import { orthogonalPath } from '@/utils/paths'

export default function Edge({ a, b, pipe, active }: { a:string;b:string;pipe?: '8' | '10' | 'G'; active: boolean }) {
  const A = byId[a]; const B = byId[b]
  if (!A || !B) return null
  const path = orthogonalPath(a, b)
  const strokeWidth = pipe === '10' ? 4 : pipe === '8' ? 3.5 : pipe === 'G' ? 3 : 3
  const pipeLabel = pipe === '10' ? 'Ø10"' : pipe === '8' ? 'Ø8"' : pipe === 'G' ? 'Gravedad' : ''
  const mx = (A.x + B.x) / 2
  const my = (A.y + B.y) / 2 - 6

  return (
    <g>
      <path d={path} className={`${active ? 'stroke-sky-600 flowing' : 'stroke-slate-300'}`} style={{ strokeWidth, fill: 'none' }} markerEnd="url(#arrow)" />
      {pipeLabel && (
        <text x={mx} y={my} textAnchor="middle" className="fill-slate-500 text-[10px]">{pipeLabel}</text>
      )}
    </g>
  )
}
