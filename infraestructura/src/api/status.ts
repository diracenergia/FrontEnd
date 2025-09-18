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
  // ⬅️ ESTE ES EL QUE TE FALTABA (provoca 422 si el dep lo exige)
  if (device) { h['X-Device-Id'] = device }

  return h
}

export async function fetchTankStatuses(apiRoot: string, opts: StatusFetchOpts = {}): Promise<TankStatusOut[]> {
  const url = `${apiRoot.replace(/\/+$/, '')}/tanks/status`
  const r = await fetch(url, { method: 'GET', headers: buildHeaders(opts), mode: 'cors' })
  if (!r.ok) {
    // Intenta mostrar detalle de FastAPI para diagnosticar rápido
    let detail = ''
    try { detail = JSON.stringify(await r.json()) } catch {}
    throw new Error(`GET /tanks/status -> ${r.status} ${r.statusText}${detail ? ' • ' + detail : ''}`)
  }
  return r.json()
}
