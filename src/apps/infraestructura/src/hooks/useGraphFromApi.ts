// src/hooks/useGraphFromApi.ts
import type { NodeBase } from '@/types/graph'
import { computeAutoLayout } from '@/layout/auto'

export type GraphResponse = { nodes: NodeBase[]; edges: string[] }

function trimSlash(s?: string | null) {
  return (s ?? '').replace(/\/+$/, '')
}

function makeNodeId(r: any) {
  // id estable: si existe code → "type:code", si no → "type_id"
  if (r.code) return `${r.type}:${r.code}`
  const rawId = r.id ?? r.asset_id ?? r.pk ?? r.uuid
  return `${r.type}_${rawId}`
}

function mapRawNode(r: any): NodeBase {
  const id = makeNodeId(r)

  // nombre común
  const name: string = r.name ?? r.title ?? id

  // coords (si no vienen, ponemos 0 para que luego el auto-layout las calcule)
  const x = typeof r.x === 'number' ? r.x : 0
  const y = typeof r.y === 'number' ? r.y : 0

  // asset/tank id real si viene
  const asset_id: number | undefined =
    typeof r.asset_id === 'number' ? r.asset_id :
    (typeof r.id === 'number' ? r.id : undefined)

  const o: NodeBase = { id, type: r.type, name, x, y, asset_id }

  // Tanks
  if (r.type === 'tank') {
    // level_ratio (0..1) o level_percent (0..100)
    const levelRatio =
      typeof r.level_ratio === 'number' ? r.level_ratio :
      (typeof r.level_percent === 'number' ? r.level_percent / 100 : undefined)
    if (typeof levelRatio === 'number') o.level = Math.max(0, Math.min(1, levelRatio))

    // capacidad: aceptar m3 o litros
    if (typeof r.capacity_m3 === 'number') o.capacity = r.capacity_m3
    else if (typeof r.capacity_liters === 'number') o.capacity = r.capacity_liters / 1000
  }

  // Pumps
  if (r.type === 'pump') {
    o.status = r.pump_status ?? r.status ?? 'unknown'
    if (typeof r.rated_kw === 'number') o.kW = r.rated_kw
  }

  // Valves
  if (r.type === 'valve') {
    o.state = r.valve_state ?? r.state ?? 'closed'
  }

  // Manifold: no extra por ahora
  return o
}

/**
 * Carga grafo desde API "infra".
 * - Primero intenta /graph (nodes+edges).
 * - Fallback a /graph/nodes y /graph/edges.
 * - Si faltan coordenadas, corre computeAutoLayout().
 * - Devuelve nodes tipados (NodeBase) y edges como "src>dst".
 */
export async function loadGraphFromApi(infraBase: string, orgId?: string): Promise<GraphResponse> {
  const base = trimSlash(infraBase)
  const headers: HeadersInit = orgId ? { 'X-Org-Id': String(orgId) } : {}

  // 1) intento directo /graph
  const r = await fetch(`${base}/graph`, { headers })
  if (r.ok) {
    const j = await r.json()
    const rawNodes = Array.isArray(j?.nodes) ? j.nodes : []
    const rawEdges = Array.isArray(j?.edges) ? j.edges : []
    let nodes = rawNodes.map(mapRawNode)

    // auto-layout si faltan coords
    const needsLayout = nodes.some(n => !n.x && !n.y)
    if (needsLayout) nodes = computeAutoLayout(nodes)

    const edges = rawEdges
      .filter((x: any) => x && x.is_active !== false)
      .map((x: any) => {
        const src = x.from_code ? `${x.from_type}:${x.from_code}` : `${x.from_type}_${x.from_id}`
        const dst = x.to_code   ? `${x.to_type}:${x.to_code}`     : `${x.to_type}_${x.to_id}`
        return `${src}>${dst}`
      })

    return { nodes, edges }
  }

  // 2) fallback /graph/nodes | /graph/edges
  const [nRes, eRes] = await Promise.all([
    fetch(`${base}/graph/nodes`, { headers }),
    fetch(`${base}/graph/edges`, { headers }),
  ])
  if (!nRes.ok || !eRes.ok) throw new Error('Fallo /graph y fallback /nodes|/edges')

  const rawNodes = await nRes.json()
  const rawEdges = await eRes.json()

  let nodes = (Array.isArray(rawNodes) ? rawNodes : []).map(mapRawNode)
  const needsLayout = nodes.some(n => !n.x && !n.y)
  if (needsLayout) nodes = computeAutoLayout(nodes)

  const edges = (Array.isArray(rawEdges) ? rawEdges : [])
    .filter((x: any) => x.is_active !== false)
    .map((x: any) => {
      const src = x.from_code ? `${x.from_type}:${x.from_code}` : `${x.from_type}_${x.from_id}`
      const dst = x.to_code   ? `${x.to_type}:${x.to_code}`     : `${x.to_type}_${x.to_id}`
      return `${src}>${dst}`
    })

  return { nodes, edges }
}
