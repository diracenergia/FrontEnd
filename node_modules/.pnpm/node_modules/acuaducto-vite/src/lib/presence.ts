// src/lib/presence.ts
import { apiHeaders } from './config';

export type PresenceItem = {
  /** Debe matchear el id del nodo (p.ej. "pump_9", "tank_1" o "pump:ABC") */
  node_id: string;
  /** 'ok' | 'warn' | 'bad' | 'disconnected' | 'unknown' */
  tone: 'ok' | 'warn' | 'bad' | 'disconnected' | 'unknown';
  /** Conveniencia: si no viene, lo derivamos de tone */
  online?: boolean;
  ts?: string;
  info?: any;
};

/**
 * Lee /conn/simple del backend y normaliza campos (acepta id|node_id, tone|conn_tone, online, ts|last_seen|updated_at).
 * apiRoot: base del backend, SIN la parte /conn (ej: "http://127.0.0.1:8000" o "https://backend.onrender.com")
 */
export async function fetchPresenceSimple(apiRoot: string): Promise<PresenceItem[]> {
  const base = (apiRoot || '').replace(/\/+$/, '');
  const url = `${base}/conn/simple`;

  try {
    const r = await fetch(url, { headers: apiHeaders() });
    if (!r.ok) return [];
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return [];

    const data = await r.json();
    if (!Array.isArray(data)) return [];

    const out: PresenceItem[] = data
      .map((raw: any) => {
        const node_id =
          raw?.node_id ?? raw?.id ?? raw?.node ?? raw?.asset_id ?? '';

        const toneRaw =
          raw?.tone ?? raw?.conn_tone ??
          (raw?.online === true ? 'ok' : raw?.online === false ? 'bad' : 'unknown');

        const tone: PresenceItem['tone'] =
          toneRaw === 'ok' || toneRaw === 'warn' || toneRaw === 'bad' ||
          toneRaw === 'disconnected' || toneRaw === 'unknown'
            ? toneRaw
            : 'unknown';

        const online =
          typeof raw?.online === 'boolean' ? raw.online : tone === 'ok';

        const ts = raw?.ts ?? raw?.last_seen ?? raw?.updated_at ?? undefined;

        return node_id ? ({ node_id, tone, online, ts, info: raw?.info }) : null;
      })
      .filter((x: PresenceItem | null): x is PresenceItem => !!x);

    return out;
  } catch {
    return [];
  }
}
