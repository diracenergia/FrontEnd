export function mockPlant() {
  const tanks = [tnk("TK-101", 12000, 62), tnk("TK-102", 8000, 18), tnk("TK-103", 10000, 91), tnk("TK-104", 16000, 47), tnk("TK-105", 6000, 8), tnk("TK-106", 9000, 33)];
  const pumps = [pmp("P-201", true, "run"), pmp("P-202", true, "stop"), pmp("P-203", false, "stop"), pmp("P-204", true, "run")];
  const alarms = [
    { id: "a1", time: "08:14:22", asset: "TK-105", text: "Nivel MUY BAJO", sev: "crit", active: true, ack: false },
    { id: "a2", time: "07:58:10", asset: "TK-103", text: "Nivel MUY ALTO", sev: "crit", active: true, ack: true },
    { id: "a3", time: "06:31:54", asset: "P-203", text: "Falla térmica", sev: "maj", active: false, ack: true },
  ];
  return { tanks, pumps, alarms };
}

function tnk(name: string, cap: number, pct: number) {
  const thresholds = { lowCritical: 10, lowWarning: 25, highWarning: 80, highCritical: 90 };
  return { id: name, name, capacityL: cap, levelPct: pct, thresholds, volumeL: Math.round((pct / 100) * cap) };
}

function pmp(name: string, vfd: boolean, state: "run" | "stop") {
  return {
    id: name, name, state, mode: "auto", fault: false, hours: Math.round(Math.random() * 12000),
    vfd: vfd ? { speedPct: state === "run" ? 62 : 0, freqHz: state === "run" ? 47 : 0, currentA: state === "run" ? 18 : 0 } : null,
  };
}
