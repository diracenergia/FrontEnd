import { byId } from '@/data/graph'

export function edgeKey(a: string, b: string) {
  return `${a}>${b}`
}

export function orthogonalPath(a: string, b: string) {
  const A = byId[a]; const B = byId[b]
  const midX = (A.x + B.x) / 2
  return `M ${A.x} ${A.y} L ${midX} ${A.y} L ${midX} ${B.y} L ${B.x} ${B.y}`
}
