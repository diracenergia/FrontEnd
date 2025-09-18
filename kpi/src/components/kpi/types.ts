// src/components/kpi/types.ts

export type TankTS = {
  timestamps: string[];
  level_percent: number[];
  volume_l: number[];
  temperature_c: number[];
};

export type PumpTS = {
  timestamps: string[];
  is_on: boolean[];
  power_kw?: number[];
};

export type KpiPayload = {
  generated_at?: string;
  org: { id: number; name: string };
  kpis: any;
  locations: any[];
  byLocation: any[];
  assets: {
    tanks: any[];
    pumps: any[];
    valves: any[];
    manifolds: any[];
  };
  latest: {
    tanks: any[];
    pumps: any[];
  };
  timeseries: {
    tanks: Record<string, TankTS>;
    pumps: Record<string, PumpTS>;
  };
  analytics30d: any;
  topology: any;
  alarms: any[];
};
