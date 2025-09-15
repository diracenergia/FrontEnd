// src/hooks/useEdgesForScenario.ts
import { useMemo } from 'react'
import { EDGES_BASE, SCENARIOS, type Pipe } from '@/data/graph'
import { edgeKey } from '@/utils/paths'

type EdgeOut = {
  a: string
  b: string
  pipe?: Pipe
  active: boolean
}

export default function useEdgesForScenario(scenario: keyof typeof SCENARIOS) {
  return useMemo<EdgeOut[]>(() => {
    // Conjunto de claves activas "A>B" del escenario seleccionado
    const activeKeys = SCENARIOS[scenario].active as readonly string[]
    const activeSet = new Set<string>(activeKeys)

    // Normalizamos pipe a undefined (nunca null) y resolvemos si está activa
    return EDGES_BASE.map(([a, b, pipe]): EdgeOut => ({
      a,
      b,
      pipe: pipe ?? undefined,
      active: activeSet.has(edgeKey(a, b) as string),
    }))
    // EDGES_BASE/SCENARIOS son constantes; con scenario alcanza
  }, [scenario])
}
