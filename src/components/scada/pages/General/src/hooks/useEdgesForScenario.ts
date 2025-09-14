import { useMemo } from 'react'
import { EDGES_BASE, SCENARIOS } from '@/data/graph'
import { edgeKey } from '@/utils/paths'

export default function useEdgesForScenario(scenario: keyof typeof SCENARIOS) {
  return useMemo(() => {
    const activeSet = new Set(SCENARIOS[scenario].active)
    return EDGES_BASE.map(([a,b,pipe]) => ({ a, b, pipe, active: activeSet.has(edgeKey(a,b)) }))
  }, [scenario])
}
