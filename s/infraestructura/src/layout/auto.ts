// src/layout/auto.ts
import type { NodeBase } from '@/data/graph'

type NodeInput = Omit<NodeBase, 'x' | 'y'> & Partial<Pick<NodeBase, 'x' | 'y'>>

/**
 * computeAutoLayout:
 *  - Mantiene columnas X fijas para ruteo Manhattan sin cruces.
 *  - Si un nodo trae x/y, se respeta; si no, se calcula.
 */
export function computeAutoLayout(base: NodeInput[]): NodeBase[] {
  const byId = new Map<string, NodeInput>(base.map(n => [n.id, n]))

  // Columnas (X) fijas
  const X = {
    plant: 140,           // P1..P7
    manifold: 300,        // MC
    branches: 500,        // M8, M10
    outValves: 660,       // V8, V10
    principals: 860,      // TP, TA (+ P8/P9 boosters al frente)
    highValves: 1020,     // VTA1..3
    highTanks: 1180,      // TA1..3 y TG

    // NUEVO: Planta Este (a la derecha de principales, antes de highTanks)
    eastPumps: 940,       // P10..P12
    eastManifold: 1080,   // ME (cerca de highValves, sin interferir)
  } as const

  // Spacing bomba planta
  const pumpTop = 80
  const pumpGap = 60

  // Grupos
  const plantPumps = ['P1','P2','P3','P4','P5','P6','P7'].filter(id => byId.has(id))
  const eastPumps  = ['P10','P11','P12'].filter(id => byId.has(id))
  const highVals   = ['VTA1','VTA2','VTA3'].filter(id => byId.has(id))
  const highTanks  = ['TA1','TA2','TA3'].filter(id => byId.has(id))

  const pumpsBottom = pumpTop + pumpGap * Math.max(plantPumps.length - 1, 0)
  const pumpsCenterY = Math.round((pumpTop + pumpsBottom) / 2) // ≈ 260

  // 1) Planta
  plantPumps.forEach((id, i) => {
    const n = byId.get(id)!
    n.x ??= X.plant
    n.y ??= pumpTop + pumpGap * i
  })

  // 2) Colectoras planta
  byId.get('MC')  && ((byId.get('MC')!.x ??= X.manifold), (byId.get('MC')!.y ??= pumpsCenterY))
  byId.get('M8')  && ((byId.get('M8')!.x ??= X.branches), (byId.get('M8')!.y ??= pumpsCenterY - 80))
  byId.get('M10') && ((byId.get('M10')!.x ??= X.branches), (byId.get('M10')!.y ??= pumpsCenterY + 60))

  // 3) Válvulas de salida planta
  byId.get('V8')  && ((byId.get('V8')!.x  ??= X.outValves), (byId.get('V8')!.y  ??= byId.get('M8')?.y  ?? (pumpsCenterY - 80)))
  byId.get('V10') && ((byId.get('V10')!.x ??= X.outValves), (byId.get('V10')!.y ??= byId.get('M10')?.y ?? (pumpsCenterY + 60)))

  // 4) Tanques principales
  byId.get('TP') && ((byId.get('TP')!.x ??= X.principals), (byId.get('TP')!.y ??= pumpsCenterY - 40)) // ≈ 220
  byId.get('TA') && ((byId.get('TA')!.x ??= X.principals), (byId.get('TA')!.y ??= pumpsCenterY + 120)) // ≈ 380

  // 5) Boosters del Pulmón delante de TP/TA (misma caja)
  const TANK_HALF = 60
  const PUMP_HALF = 26
  const GAP_SIDE  = 18
  const boosterX  = X.principals - (TANK_HALF + GAP_SIDE + PUMP_HALF)
  byId.get('P8') && ((byId.get('P8')!.x ??= boosterX), (byId.get('P8')!.y ??= byId.get('TP')?.y ?? (pumpsCenterY - 40)))
  byId.get('P9') && ((byId.get('P9')!.x ??= boosterX), (byId.get('P9')!.y ??= byId.get('TA')?.y ?? (pumpsCenterY + 120)))
  byId.get('MB') && ((byId.get('MB')!.x ??= X.highValves), (byId.get('MB')!.y ??= byId.get('TP')?.y ?? pumpsCenterY))

  // 6) Válvulas hacia tanques altos + 7) Tanques altos (alineados)
  const highTop = (byId.get('TP')?.y ?? 220) - 140
  const highGap = 60
  highVals.forEach((id, i) => { const v = byId.get(id)!; v.x ??= X.highValves; v.y ??= highTop + highGap * i })
  highTanks.forEach((id, i) => {
    const t = byId.get(id)!
    t.x ??= X.highTanks
    const vId = ('V' + id) as any // VTA1..3
    t.y ??= byId.get(vId)?.y ?? (highTop + highGap * i)
  })

  // 8) Gravedad
  byId.get('VG') && ((byId.get('VG')!.x ??= X.highValves), (byId.get('VG')!.y ??= byId.get('TA')?.y ?? (pumpsCenterY + 120)))
  byId.get('TG') && ((byId.get('TG')!.x ??= X.highTanks),  (byId.get('TG')!.y ??= (byId.get('VG')?.y ?? (pumpsCenterY + 120)) + 80))

  // --- NUEVO: Planta Este (tres bombas) ---
  if (eastPumps.length) {
    const eastTop = (byId.get('TA')?.y ?? 380) + 140 // debajo de TA
    eastPumps.forEach((id, i) => {
      const n = byId.get(id)!
      n.x ??= X.eastPumps
      n.y ??= eastTop + i * 60
    })
    // Colectora de Planta Este centrada con sus bombas
    if (byId.has('ME')) {
      const m = byId.get('ME')!
      m.x ??= X.eastManifold
      const y1 = byId.get(eastPumps[0])?.y ?? eastTop
      const yN = byId.get(eastPumps[eastPumps.length - 1])?.y ?? eastTop
      m.y ??= Math.round((y1 + yN) / 2)
    }
  }

  // --- NUEVO: Colectora de tanques altos -> bomba PB ---
  if (byId.has('MTAH')) {
    const m = byId.get('MTAH')!
    const midHighY =
      byId.get('VTA2')?.y ??
      Math.round(((byId.get('TA1')?.y ?? highTop) + (byId.get('TA3')?.y ?? (highTop + 2 * highGap))) / 2)

    m.x ??= X.highValves
    m.y ??= midHighY

    if (byId.has('PB')) {
      const pb = byId.get('PB')!
      // bomba a la izquierda de MTAH, alineada en Y
      const pbX = X.highValves - (TANK_HALF + GAP_SIDE + PUMP_HALF) // similar a boosters
      pb.x ??= pbX
      pb.y ??= m.y
    }
  }

  // Ensamble final garantizando x/y definidos
  return base.map(n => ({
    ...n,
    x: (n.x ?? byId.get(n.id)!.x!) as number,
    y: (n.y ?? byId.get(n.id)!.y!) as number,
  })) as NodeBase[]
}
