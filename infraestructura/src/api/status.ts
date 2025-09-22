// src/api/status.ts
export type TankStatusOut = {
  tank_id: number
  status: 'ok' | 'warn' | 'crit' | 'offline'
  color_hex: string
}

export type StatusFetchOpts = {
  apiKey?: string
  orgId?: string | number
  deviceId?: string
}

function pick(val?: string | null) {
  return (val ?? '').trim()
}

function buildHeaders(opts: StatusFetchOpts = {}) {
  const key =
    pick(opts.apiKey) ||
    pick(localStorage.getItem('apiKey')) ||
    pick((import.meta as any)?.env?.VITE_API_KEY)

  const org =
    pick(String(opts.orgId ?? '')) ||
    pick(localStorage.getItem('orgId')) ||
    pick((import.meta as any)?.env?.VITE_ORG_ID) ||
    '1'

  const device =
    pick(opts.deviceId) ||
    pick(localStorage.getItem('deviceId')) ||
    pick((import.meta as any)?.env?.VITE_DEVICE_ID)

  const h: Record<string, string> = { Accept: 'application/json' }

  if (key) { h['X-API-Key'] = key; h['Authorization'] = `Bearer ${key}` }
  if (org) { h['X-Org-Id'] = String(org) }
  if (device) { h['X-Device-Id'] = device }

  return h
}

// Aquí eliminamos la función fetchTankStatuses, ya que ahora todo se obtiene desde el gráfico.
