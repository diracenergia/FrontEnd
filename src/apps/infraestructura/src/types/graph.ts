// src/types/graph.ts

/** Tipos de nodo que renderiza el diagrama */
export type NodeType = 'tank' | 'pump' | 'valve' | 'manifold';

/** Estado de bomba (lo que usa la UI) */
export type PumpStatus = 'on' | 'standby' | 'fault' | 'unknown';

/** Estado de válvula */
export type ValveState = 'open' | 'closed' | 'throttle';

/** Tono de “presencia/conexión” calculado por el front (poll/WebSocket) */
export type PresenceTone = 'ok' | 'warn' | 'bad' | 'unknown';

/**
 * Estado de tanque para UI. Incluye sinónimos:
 * - 'warn'/'crit' (usados en el cálculo por umbrales en front)
 * - 'warning'/'critical' (por compatibilidad con backend/otros)
 * - 'disconnected' (sin datos)
 */
export type TankStatus = 'ok' | 'warn' | 'crit' | 'warning' | 'critical' | 'disconnected';

/** Nodo normalizado que usa todo el front */
export type NodeBase = {
  id: string;               // uid estable (p.ej. "tank_8", "pump_12", "valve:TA1")
  type: NodeType;
  name: string;
  x: number;
  y: number;

  // Identificadores opcionales para cruzar con backend
  asset_id?: number;        // id numérico real en DB
  code?: string | null;     // código corto (si lo maneja el backend)

  /* ---------- Tanks ---------- */
  level?: number;           // 0..1 o 0..100 (el front normaliza)
  capacity?: number;        // m³ opcional (para etiqueta)
  // Umbrales en % (si no vienen, el front usa defaults razonables)
  low_pct?: number;
  low_low_pct?: number;
  high_pct?: number;
  high_high_pct?: number;
  // Estado/color calculado o provisto por backend
  tank_status?: TankStatus;
  tank_color_hex?: string;

  /* ---------- Pumps ---------- */
  status?: PumpStatus;      // 'on'|'standby'|'fault'|'unknown'
  kW?: number | null;

  /* ---------- Valves ---------- */
  state?: ValveState;       // 'open'|'closed'|'throttle'

  /* ---------- Presencia (simple) ---------- */
  conn_tone?: PresenceTone; // 'ok'|'warn'|'bad'|'unknown'
};

/* =========================
 * Tipos auxiliares (opcional)
 * ========================= */

/** Nodo tal como puede venir del endpoint /infra/graph (más laxo) */
export type ApiNode = {
  id?: string;
  type: NodeType;
  name: string;

  // Posición (opcional en backend; si no viene, se autolayout)
  x?: number;
  y?: number;

  // Identificadores de backend
  asset_id?: number;
  code?: string | null;

  // Tanks
  level?: number | null;
  capacity?: number | null;
  low_pct?: number | null;
  low_low_pct?: number | null;
  high_pct?: number | null;
  high_high_pct?: number | null;
  tank_status?: TankStatus | null;
  tank_color_hex?: string | null;

  // Pumps
  status?: boolean | PumpStatus | null;  // boolean -> se mapea a 'on'/'standby'
  kW?: number | null;

  // Valves
  state?: ValveState | null;
};

/** Forma del grafo que devuelve el backend */
export type ApiGraph = {
  nodes: ApiNode[];
  /** Aristas como "src>dst" con ids de nodos (ej: "tank_8>pump_12") */
  edges: string[];
};

/** Par de nodos ya parseado para el render de Edge */
export type EdgePair = { a: string; b: string };
