// src/utils/paths.ts
import type { NodeBase } from '@/types/graph'

export function edgeKey(a: string, b: string) {
  return `${a}>${b}`
}

/** Resolver global (inyectable) para encontrar nodos por id sin importar la fuente */
export type NodeResolver = (id: string) => Pick<NodeBase, 'x' | 'y'> | undefined
let _resolver: NodeResolver | null = null

/** Registrá cómo resolver ids → nodos (llamalo una sola vez en el bootstrap) */
export function setNodeResolver(fn: NodeResolver) {
  _resolver = fn
}

/** Path ortogonal usando ids + (opcional) overrides de A/B o un resolver ad-hoc */
export function orthogonalPath(
  a: string,
  b: string,
  opts?: { A?: Pick<NodeBase, 'x'|'y'>; B?: Pick<NodeBase, 'x'|'y'>; resolve?: NodeResolver }
) {
  const resolve = opts?.resolve ?? _resolver
  const A = opts?.A ?? (resolve ? resolve(a) : undefined)
  const B = opts?.B ?? (resolve ? resolve(b) : undefined)
  if (!A || !B) return '' // sin nodos no podemos trazar

  const midX = (A.x + B.x) / 2
  return `M ${A.x} ${A.y} L ${midX} ${A.y} L ${midX} ${B.y} L ${B.x} ${B.y}`
}

/** Variante directa cuando ya tenés los nodos */
export function orthogonalPathFrom(A: Pick<NodeBase,'x'|'y'>, B: Pick<NodeBase,'x'|'y'>) {
  const midX = (A.x + B.x) / 2
  return `M ${A.x} ${A.y} L ${midX} ${A.y} L ${midX} ${B.y} L ${B.x} ${B.y}`
}
