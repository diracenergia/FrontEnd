// src/hooks/useTankStatuses.ts
import { useEffect, useState } from 'react'
import { fetchTankStatuses, type TankStatusOut, type StatusFetchOpts } from '@/api/status'

export default function useTankStatuses(
  apiRoot: string,
  opts: { intervalMs?: number } & StatusFetchOpts = {}
) {
  const [data, setData] = useState<TankStatusOut[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const interval = opts.intervalMs ?? 5000

  useEffect(() => {
    let alive = true

    const load = async () => {
      try {
        const d = await fetchTankStatuses(apiRoot, opts)
        if (alive) { setData(d); setError(null) }
      } catch (e: any) {
        if (alive) setError(String(e?.message || e))
      }
    }

    load()
    const t = setInterval(load, interval)
    return () => { alive = false; clearInterval(t) }
  }, [apiRoot, interval, opts.apiKey, opts.orgId, opts.deviceId])

  return { data, error }
}
