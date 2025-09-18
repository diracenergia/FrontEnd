import type { KpiPayload } from "./types";
import { buildPowerFromIsOn } from "./energy";

export const mock: KpiPayload = {
  generated_at: new Date().toISOString(),
  org: { id: 1, name: "Demo" },
  kpis: { assets_total: 2, tanks: 1, pumps: 1, valves: 0, manifolds: 0, alarms_active: 0, alarms_critical_active: 0, avg_flow_lpm_30d: 0, avg_level_pct_30d: 60 },
  locations: [{ location_id: 1, location_code: "LOC-1", location_name: "Loc 1" }],
  byLocation: [{
    location_id: 1, location_code: "LOC-1", location_name: "Loc 1",
    assets_total: 2, tanks_count: 1, pumps_count: 1, valves_count: 0, manifolds_count: 0,
    alarms_active: 0, alarms_critical_active: 0,
    pump_readings_30d: 24, avg_flow_lpm_30d: 80, avg_pressure_bar_30d: 2.5, pumps_last_seen: null,
    tank_readings_30d: 24, avg_level_pct_30d: 60, tanks_last_seen: null
  }],
  assets: {
    tanks: [{ id: 1, name: "Tank 1", capacity_liters: 50000, location_id: 1, fluid: "Agua" }],
    pumps: [{ id: 101, name: "Bomba A", rated_kw: 7.5, drive_type: "vfd", location_id: 1, group_id: 1 }],
    valves: [],
    manifolds: [],
  },
  latest: {
    tanks: [{ tank_id: 1, ts: new Date().toISOString(), level_percent: 62, volume_l: 31000, temperature_c: 18 }],
    pumps: [{ pump_id: 101, ts: new Date().toISOString(), is_on: true, flow_lpm: 90, pressure_bar: 2.6, voltage_v: 380, current_a: 12, control_mode: "auto", manual_lockout: false }],
  },
  timeseries: {
    tanks: {
      "1": {
        timestamps: Array.from({ length: 24 }).map((_, i) => `2025-09-17T${String(i).padStart(2,"0")}:00:00`),
        level_percent: Array.from({ length: 24 }).map(() => 55 + Math.round(Math.random()*10)),
        volume_l: Array.from({ length: 24 }).map(() => 30000 + Math.round(Math.random()*2000)),
        temperature_c: Array.from({ length: 24 }).map(() => 16 + Math.round(Math.random()*4)),
      },
    },
    pumps: {
      "101": {
        timestamps: Array.from({ length: 24 }).map((_, i) => `2025-09-17T${String(i).padStart(2,"0")}:00:00`),
        is_on: Array.from({ length: 24 }).map((_, i) => (i % 6) < 3),
      },
    },
  },
  analytics30d: {
    pump_uptime: { "101": { pump_id: 101, pump_name: "Bomba A", on_seconds: 12*3600, total_seconds: 24*3600, uptime_pct_30d: 50 } },
    pump_energy_kwh: { "101": { pump_id: 101, kwh_30d: 60 } },
  },
  topology: { edges: [], nodes: [] },
  alarms: [],
};

buildPowerFromIsOn(mock);
export default mock;
