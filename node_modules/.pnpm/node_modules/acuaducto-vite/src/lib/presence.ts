// src/lib/presence.ts
import { getBaseUrl, apiHeaders } from './config';

export type PresenceSimple = { id: string; ts?: string; info?: any };

export async function fetchPresenceSimple(): Promise<PresenceSimple[]> {
  const b = getBaseUrl();
  try {
    const r = await fetch(`${b}/conn/simple`, { headers: apiHeaders() });
    if (!r.ok) {
      if (r.status === 404) {
        // No existe en tu backend → no spamear la consola
        return [];
      }
      return [];
    }
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return [];
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  } catch {
    // Si el backend no responde, devolvemos vacío
    return [];
  }
}
