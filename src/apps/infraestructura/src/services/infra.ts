// src/services/infra.ts
import { getBaseUrl, apiHeaders } from '../lib/config';

function asHttpError(status: number, url: string, text: string) {
  const snippet = text?.slice(0, 200) || '';
  return new Error(`(${status}) ${url} • ${snippet}`);
}

async function fetchJSON<T = any>(path: string): Promise<T> {
  const base = getBaseUrl();
  const url = `${base.replace(/\/+$/, '')}${path}`;
  const r = await fetch(url, { headers: apiHeaders() });
  const ct = r.headers.get('content-type') || '';
  const body = await r.text();
  if (!r.ok) {
    // Si backend respondió HTML (<!doctype), evitamos SyntaxError
    if (!ct.includes('application/json')) throw asHttpError(r.status, url, body);
    try {
      const j = JSON.parse(body);
      throw asHttpError(r.status, url, JSON.stringify(j));
    } catch {
      throw asHttpError(r.status, url, body);
    }
  }
  if (!ct.includes('application/json')) throw asHttpError(r.status, url, body);
  return JSON.parse(body) as T;
}

export type InfraGraph = { nodes: any[]; edges: string[] };

export async function getInfraGraph(): Promise<InfraGraph> {
  // Nuevo endpoint backend
  return fetchJSON<InfraGraph>('/infra/graph');
}

export async function getInfraNodes(): Promise<any[]> {
  return fetchJSON<any[]>('/infra/graph/nodes');
}

export async function getInfraEdges(): Promise<any[]> {
  return fetchJSON<any[]>('/infra/graph/edges');
}

export async function getLocations(): Promise<any[]> {
  // Tu backend expone /locations (sin /infra). Si no está, devolvemos []
  const base = getBaseUrl();
  const url = `${base}/locations`;
  try {
    const r = await fetch(url, { headers: apiHeaders() });
    if (r.status === 404) return [];
    if (!r.ok) throw asHttpError(r.status, url, await r.text());
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return [];
    return r.json();
  } catch {
    return [];
  }
}
