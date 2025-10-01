// src/lib/config.ts
export function getBaseUrl(): string {
  // Prioridad: localStorage → Vite env → origin del browser
  const ls = (typeof localStorage !== 'undefined' && localStorage.getItem('base_url')) || '';
  const env = (import.meta as any)?.env?.VITE_API_BASE || '';
  return (ls || env || window.location.origin || '').toString().trim().replace(/\/+$/, '');
}

export function getOrgId(): number {
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get('org');
    const mem = (typeof localStorage !== 'undefined' && localStorage.getItem('org_id')) || '';
    const raw = q || mem || '1';
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  } catch {
    return 1;
  }
}

export function apiHeaders(org?: number): Record<string, string> {
  const headers: Record<string, string> = {
    'x-org-id': String(org ?? getOrgId()),
    'x-device-id': (typeof localStorage !== 'undefined' && localStorage.getItem('device_id')) || 'ui-embed',
  };
  const k = (typeof localStorage !== 'undefined' && localStorage.getItem('api_key')) || '';
  if (k) headers['x-api-key'] = k;
  return headers;
}
