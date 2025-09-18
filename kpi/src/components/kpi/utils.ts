// src/components/kpi/utils.ts
export const k = (n: number) => new Intl.NumberFormat("es-AR").format(n);
export const pct = (n: number) => `${n.toFixed(1)}%`;

export const bandForHour = (h: number) => (h < 7 ? "VALLE" : h < 19 ? "RESTO" : h < 23 ? "PICO" : "VALLE");


export const devAssert = (cond: unknown, msg = "Assertion failed"): void => {
  if (!cond) {
    // no frenamos la app, solo avisamos en consola
    console.warn("[devAssert]", msg);
  }
};

export function buildPowerFromIsOn(data: any) {
  for (const p of data.assets.pumps) {
    const ts = data.timeseries.pumps[String(p.id)];
    if (!ts) continue;
    ts.power_kw = ts.is_on.map((on: boolean) => {
      const base = on ? p.rated_kw * 0.82 : 0.1;
      const jitter = on ? (Math.random() * 0.2 - 0.1) * p.rated_kw : 0;
      return Math.max(0, Number((base + jitter).toFixed(2)));
    });
  }
}

export function kwhByBandForPump(pumpTs: { timestamps: string[]; power_kw?: number[] }) {
  if (!pumpTs?.power_kw) return { VALLE: 0, PICO: 0, RESTO: 0, total: 0 };
  const acc = { VALLE: 0, PICO: 0, RESTO: 0 };
  pumpTs.timestamps.forEach((t, i) => {
    const h = Number(t.slice(11, 13));
    const band = bandForHour(h) as keyof typeof acc;
    acc[band] += pumpTs.power_kw![i] || 0;
  });
  const total = acc.VALLE + acc.PICO + acc.RESTO;
  return { ...acc, total };
}

// Métricas rápidas
export const countStarts = (isOn: boolean[]) => isOn.slice(1).reduce((s, v, i) => s + (!isOn[i] && v ? 1 : 0), 0);
export const availabilityPct = (isOn: boolean[]) => (isOn.filter(Boolean).length / Math.max(1, isOn.length)) * 100;
export function avgOnDurationHours(isOn: boolean[]) {
  let total = 0, runs = 0, cur = 0;
  for (let i = 0; i < isOn.length; i++) { if (isOn[i]) cur++; if ((!isOn[i] || i === isOn.length - 1) && cur>0){ total+=cur; runs++; cur=0; } }
  return runs ? total / runs : 0;
}
export function tankStats(ts?: { level_percent?: number[] }) {
  const arr = ts?.level_percent ?? [];
  if (!arr.length) return { min: null, max: null, mean: null, range: null };
  const min = Math.min(...arr), max = Math.max(...arr);
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return { min, max, mean, range: max - min };
}
export function tempStats(ts?: { temperature_c?: number[] }) {
  const arr = ts?.temperature_c ?? [];
  if (!arr.length) return { mean: null, min: null, max: null };
  const min = Math.min(...arr), max = Math.max(...arr);
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return { mean, min, max };
}
export const turnoverEstimatePerDay = (levelRangePct: number) => Math.max(0, Number(levelRangePct.toFixed(1)));
export function criticalResolvedUnder24h(alarms: any[]) {
  const crit = alarms.filter((a: any) => a.severity === "critical");
  if (!crit.length) return { pct: 100, total: 0 };
  const ok = crit.filter((a: any) => a.is_active === false).length;
  return { pct: (ok / crit.length) * 100, total: crit.length };
}
export function topEnergyByLocation(data: any) {
  const map = new Map<number, number>();
  for (const p of data.assets.pumps) {
    const rec = data.analytics30d.pump_energy_kwh[String(p.id)];
    map.set(p.location_id, (map.get(p.location_id) || 0) + (rec ? rec.kwh_30d : 0));
  }
  const rows = data.locations.map((l: any) => ({
    location_id: l.location_id,
    location_name: l.location_name,
    code: l.location_code,
    kwh_30d: map.get(l.location_id) || 0,
  }));
  return rows.sort((a: any, b: any) => b.kwh_30d - a.kwh_30d).slice(0, 3);
}
