// src/lib/presence.ts
import { getBaseUrl, apiHeaders } from './config';

export type PresenceItem = {
  node_id: string;
  tone: 'ok' | 'warn' | 'bad' | 'unknown';
  online?: boolean;
  ts?: string;
  info?: any;
};

/**
 * Lee /conn/simple y normaliza campos (acepta id|node_id, tone|conn_tone, online, ts|last_seen|updated_at).
 * apiRoot: base del backend, SIN /conn (ej: "http://127.0.0.1:8000" o "https://backend.onrender.com")
 */
export async function fetchPresenceSimple(apiRoot?: string): Promise<PresenceItem[]> {
  const base = (apiRoot || getBaseUrl() || '').toString().replace(/\/+$/, '');
  const url = `${base}/conn/simple`;

  try {
    const r = await fetch(url, { headers: apiHeaders() });
    if (!r.ok) return []; // 404 u otro → vacío silencioso

    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return [];

    const data: any = await r.json();
    if (!Array.isArray(data)) return [];

    const allowed = new Set(['ok', 'warn', 'bad', 'unknown']);

    const out: PresenceItem[] = data
      .map((raw: any) => {
        const node_id =
          raw?.node_id ?? raw?.id ?? raw?.node ?? raw?.asset_id ?? '';
        const toneRaw =
          raw?.tone ?? raw?.conn_tone ??
          (typeof raw?.online === 'boolean' ? (raw.online ? 'ok' : 'bad') : 'unknown');

        const tone: PresenceItem['tone'] =
          allowed.has(String(toneRaw)) ? (toneRaw as any) : 'unknown';

        const online =
          typeof raw?.online === 'boolean' ? raw.online : tone === 'ok';

        const ts = raw?.ts ?? raw?.last_seen ?? raw?.updated_at ?? undefined;

        return node_id ? ({ node_id: String(node_id), tone, online, ts, info: raw?.info }) : null;
      })
      .filter((x: PresenceItem | null): x is PresenceItem => !!x);

    return out;
  } catch {
    return [];
  }
}
