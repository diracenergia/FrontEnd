// src/types/graph.ts
export type NodeType = 'tank' | 'pump' | 'valve' | 'manifold';

export type NodeBase = {
  id: string;
  type: NodeType;
  name: string;
  x: number;
  y: number;

  // Tanks
  level?: number;
  capacity?: number;
  // NUEVO para estados de alarmas
  asset_id?: number;
  tank_status?: 'disconnected' | 'warning' | 'critical' | 'ok';
  tank_color_hex?: string;

  // Pumps
  status?: 'on' | 'standby' | 'fault' | 'unknown';
  kW?: number;

  // Valves
  state?: 'open' | 'closed' | 'throttle';
};
