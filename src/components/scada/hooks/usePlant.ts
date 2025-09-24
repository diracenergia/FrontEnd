import React from "react";
import { api } from "../../../lib/api";

type PlantState = {
  tanks: any[];
  pumps: any[];
  alarms: any[];
};

const DEFAULT_THRESHOLDS = { lowCritical: 10, lowWarning: 25, highWarning: 80, highCritical: 90 };

const STALE_WARN_SEC = Number(import.meta.env.VITE_STALE_WARN_SEC ?? 120);
const STALE_CRIT_SEC = Number(import.meta.env.VITE_STALE_CRIT_SEC ?? 300);

function secSince(ts?: string | null) {
  if (!ts) return Number.POSITIVE_INFINITY;
  const t = new Date(ts).getTime();
  if (!isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.round((Date.now() - t) / 1000));
}
function healthFromSec(s: number) {
  if (!isFinite(s)) return { tone: "bad" as const, label: "Sin datos" };
  if (s < STALE_WARN_SEC) return { tone: "ok" as const, label: "OK" };
  if (s < STALE_CRIT_SEC) return { tone: "warn" as const, label: "Lenta" };
  return { tone: "bad" as const, label: "Caída" };
}
const toPct = (n: any) => (typeof n === "number" && isFinite(n) ? n : 0);

const mapConfigToThresholds = (t: any) => ({
  lowCritical: t.low_low_pct ?? DEFAULT_THRESHOLDS.lowCritical,
  lowWarning: t.low_pct ?? DEFAULT_THRESHOLDS.lowWarning,
  highWarning: t.high_pct ?? DEFAULT_THRESHOLDS.highWarning,
  highCritical: t.high_high_pct ?? DEFAULT_THRESHOLDS.highCritical,
});

export function usePlant(refreshMs = 5000) {
  const [plant, setPlant] = React.useState<PlantState>({ tanks: [], pumps: [], alarms: [] });
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const lastSeen = React.useRef<Record<string, { ts?: string | null; reading_id?: number }>>({});

  const load = React.useCallback(async () => {
    // 1) Tanques
    const tanksCfg = await api.listTanksWithConfig();
    const tanks = await Promise.all(
      tanksCfg.map(async (t: any) => {
        try {
          const latest = await api.tankLatest(t.id);
          const levelPct = typeof latest?.level_percent === "number" ? latest.level_percent : null;
          const capacityL = typeof t?.capacity_liters === "number" ? t.capacity_liters : null;
          const volumeL =
            typeof latest?.volume_l === "number"
              ? latest.volume_l
              : levelPct != null && capacityL != null
              ? Math.round((capacityL * levelPct) / 100)
              : null;

          return {
            id: `TK-${t.id}`,
            tankId: t.id,
            name: t.name,
            capacityL,
            levelPct,
            volumeL,
            temperatureC: latest?.temperature_c ?? null,
            thresholds: mapConfigToThresholds(t),
            latest,
            material: t.material ?? null,
            fluid: t.fluid ?? null,
            install_year: t.install_year ?? null,
            location_text: t.location_text ?? null,
          };
        } catch {
          const capacityL = typeof t?.capacity_liters === "number" ? t.capacity_liters : null;
          return {
            id: `TK-${t.id}`,
            tankId: t.id,
            name: t.name,
            capacityL,
            levelPct: null,
            volumeL: null,
            temperatureC: null,
            thresholds: mapConfigToThresholds(t),
            latest: null,
            material: t.material ?? null,
            fluid: t.fluid ?? null,
            install_year: t.install_year ?? null,
            location_text: t.location_text ?? null,
          };
        }
      })
    );

    // 2) Bombas
    const pumpsCfg = await api.listPumpsWithConfig();
    const pumps = await Promise.all(
      (pumpsCfg ?? []).map(async (p: any) => {
        const latest = await api.pumpLatest(p.id).catch(() => null);
        const extra = (latest?.extra ?? {}) as any;
        const selRaw = String(extra.selector_mode ?? extra.selector ?? extra.mode ?? "").toLowerCase();
        const manualLockout =
          selRaw === "manual" ||
          selRaw === "man" ||
          selRaw === "local" ||
          selRaw === "lockout" ||
          selRaw === "lock-out" ||
          extra.local === true ||
          extra.lockout === true;
        const uiMode: "auto" | "manual" = manualLockout ? "manual" : "auto";

        return {
          id: `PU-${p.id}`,
          pumpId: p.id,
          name: p.name,
          model: p.model,
          maxFlowLpm: p.max_flow_lpm,
          driveType: p.drive_type ?? null,
          remoteEnabled: (p.remote_enabled ?? true) === true,
          vfd:
            p.drive_type === "vfd"
              ? {
                  min: p.vfd_min_speed_pct ?? 0,
                  max: p.vfd_max_speed_pct ?? 100,
                  def:
                    p.vfd_default_speed_pct ??
                    Math.round(((p.vfd_min_speed_pct ?? 0) + (p.vfd_max_speed_pct ?? 100)) / 2),
                }
              : null,
          latest,
          state: latest?.is_on ? "run" : "stop",
          fault: false,
          mode: uiMode,
          hours: undefined,
          control: { manual_lockout: manualLockout },
        };
      })
    );

    // 3) Alarmas
    const alarms = await api.listAlarms(true);
    return { tanks, pumps, alarms };
  }, []);

  const reload = React.useCallback(async () => {
    try {
      setLoading(true);
      const data = await load();
      setPlant(data);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [load]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const data = await load();
        if (!alive) return;
        setPlant(data);
        setErr(null);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || String(e));
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    const id = setInterval(() => alive && reload(), refreshMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [reload, refreshMs, load]);

  // KPIs y salud de telemetría
  const kpis = React.useMemo(() => {
    const tanks = plant.tanks || [];
    const withNum = tanks.filter((t: any) => typeof t.levelPct === "number" && isFinite(t.levelPct));
    const avg = withNum.length
      ? Math.round(withNum.reduce((a: number, t: any) => a + t.levelPct, 0) / withNum.length)
      : 0;

    const crit = tanks.filter((t: any) => {
      const v = toPct(t.levelPct);
      const th = t.thresholds || DEFAULT_THRESHOLDS;
      return v <= th.lowCritical || v >= th.highCritical;
    }).length;

    const alarmsAct = plant.alarms?.length ?? 0;

    const rawAssets = [
      ...(plant.tanks || []).map((t: any) => ({
        key: `TK-${t.tankId ?? t.id}`,
        label: `Tanque ${t.name ?? t.tankId ?? t.id}`,
        ts: t.latest?.ts as string | undefined,
        reading_id: t.latest?.reading_id as number | undefined,
      })),
      ...(plant.pumps || []).map((p: any) => ({
        key: `PU-${p.pumpId ?? p.id}`,
        label: `Bomba ${p.name ?? p.pumpId ?? p.id}`,
        ts: p.latest?.ts as string | undefined,
        reading_id: p.latest?.reading_id as number | undefined,
      })),
    ];

    let moved = 0,
      total = 0;
    const perAsset = rawAssets.map((a) => {
      const ageSec = secSince(a.ts);
      const h = healthFromSec(ageSec);
      const prev = lastSeen.current[a.key];
      const advanced = a.reading_id != null ? prev?.reading_id !== a.reading_id : a.ts != null && prev?.ts !== a.ts;

      if (a.ts) total++;
      if (advanced) moved++;
      lastSeen.current[a.key] = { ts: a.ts, reading_id: a.reading_id };

      return {
        key: a.key,
        label: a.label,
        ageSec,
        tone: h.tone as "ok" | "warn" | "bad",
        advanced,
      };
    });

    const ages = perAsset.map((a) => a.ageSec).filter(Number.isFinite);
    const worstLag = ages.length ? Math.max(...ages) : Number.POSITIVE_INFINITY;
    const telemetry = healthFromSec(worstLag);

    const badAssets = perAsset.filter((a) => a.tone === "bad");
    const warnAssets = perAsset.filter((a) => a.tone === "warn");

    const newPct = total ? Math.round((moved / total) * 100) : 0;

    return { avg, crit, alarmsAct, telemetry, worstLag, newPct, perAsset, badAssets, warnAssets };
  }, [plant]);

  // sets derivados
  const badKeys = React.useMemo(() => new Set((kpis.badAssets ?? []).map((a) => a.key)), [kpis.badAssets]);
  const warnKeys = React.useMemo(() => new Set((kpis.warnAssets ?? []).map((a) => a.key)), [kpis.warnAssets]);

  return { plant, setPlant, loading, err, kpis, badKeys, warnKeys, reload };
}
