import type { PumpTS } from "./types";

export type Band = "VALLE" | "PICO" | "RESTO";

// VALLE: 00–07, PICO: 19–23, RESTO: 07–19
export const bandForHour = (h: number): Band => {
  if (h >= 0 && h < 7) return "VALLE";
  if (h >= 19 && h < 23) return "PICO";
  return "RESTO";
};

export function buildPowerFromIsOn<T extends { assets: any; timeseries: any }>(data: T) {
  for (const p of data.assets.pumps) {
    const ts: PumpTS | undefined = data.timeseries.pumps[String(p.id)];
    if (!ts) continue;
    ts.power_kw = ts.is_on.map((on: boolean) => {
      const base = on ? p.rated_kw * 0.82 : 0.1; // 0.82 carga aprox; 0.1 kW standby
      const jitter = on ? (Math.random() * 0.2 - 0.1) * p.rated_kw : 0; // ±10%
      return Math.max(0, Number((base + jitter).toFixed(2)));
    });
  }
}

export function kwhByBandForPump(pumpTs: PumpTS) {
  if (!pumpTs?.power_kw) return { VALLE: 0, PICO: 0, RESTO: 0, total: 0 };
  const acc: Record<Band, number> = { VALLE: 0, PICO: 0, RESTO: 0 };
  pumpTs.timestamps.forEach((t, i) => {
    const h = Number(t.slice(11, 13));
    const band = bandForHour(h);
    const kwh = pumpTs.power_kw![i] ?? 0;
    acc[band] += kwh;
  });
  const total = acc.VALLE + acc.PICO + acc.RESTO;
  return { ...acc, total };
}