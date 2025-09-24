// src/components/scada/pages/TrendsPage.tsx
import React from "react";
import {
  api,
  type TankWithConfig,
  getApiBase,
  getApiKey,
} from "../../../lib/api";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
} from "recharts";

/** Normaliza timestamp (ISO, segundos, ms) a milisegundos */
function toMsAny(t: any): number | null {
  if (t == null) return null;
  if (typeof t === "number") return t < 1e12 ? t * 1000 : t; // seg → ms
  if (typeof t === "string") {
    const n = Number(t);
    if (!Number.isNaN(n)) return n < 1e12 ? n * 1000 : n;
    const ms = new Date(t).getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  const ms = new Date(t as any).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** number | null seguro desde Decimal/string/number */
function toNumOrNull(v: any): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

type Row = { ts: number; level_percent: number | null };

const DAY_MS = 24 * 60 * 60 * 1000;
// umbral de gap (segundos) para cortar la línea (configurable por .env)
const TREND_GAP_SEC = Number((import.meta as any)?.env?.VITE_TREND_GAP_SEC ?? 300);

/** Inserta puntos con level_percent=null cuando hay gaps > gapSec */
function injectMissingGaps(points: Row[], gapSec = TREND_GAP_SEC): Row[] {
  const data = [...points].sort((a, b) => a.ts - b.ts);
  const out: Row[] = [];
  for (let i = 0; i < data.length; i++) {
    const cur = data[i];
    out.push(cur);
    const nxt = data[i + 1];
    if (!nxt) break;
    const dtSec = (nxt.ts - cur.ts) / 1000;
    if (dtSec > gapSec) {
      // dos sentinelas null muy cercanos a los bordes del gap para cortar la línea
      out.push({ ts: cur.ts + 1, level_percent: null });
      out.push({ ts: nxt.ts - 1, level_percent: null });
    }
  }
  return out;
}

export function TrendsPage() {
  const [tanks, setTanks] = React.useState<TankWithConfig[]>([]);
  const [tankId, setTankId] = React.useState<number | null>(null);
  const [data, setData] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = React.useState<number | null>(null);

  /** Umbrales desde la config del tanque (con defaults) */
  const tankCfg = React.useMemo(
    () => (tankId != null ? tanks.find((t) => t.id === tankId) ?? null : null),
    [tanks, tankId]
  );
  const lowLow   = toNumOrNull(tankCfg?.low_low_pct) ?? 10;
  const low      = toNumOrNull(tankCfg?.low_pct) ?? 25;
  const high     = toNumOrNull(tankCfg?.high_pct) ?? 80;
  const highHigh = toNumOrNull(tankCfg?.high_high_pct) ?? 90;

  /** Cargar tanques (/tanks/config) y elegir uno (prioriza id=1) */
  React.useEffect(() => {
    (async () => {
      try {
        const tkCfg = await api.listTanksWithConfig();
        if (Array.isArray(tkCfg) && tkCfg.length) {
          setTanks(tkCfg);
          const prefer = tkCfg.find((t) => t.id === 1)?.id ?? tkCfg[0].id;
          setTankId(prefer);
          return;
        }
      } catch { /* fallback duro */ }
      setTanks([]);
      setTankId(1);
    })();
  }, []);

  /** Parser: coerciona valores y ordena por ts asc */
  const parseRows = React.useCallback((arr: any[]): Row[] => {
    return (Array.isArray(arr) ? arr : [])
      .map((r: any) => {
        const ts = toMsAny(r?.ts);
        const level_percent = toNumOrNull(r?.level_percent ?? r?.level_pct);
        return { ts: ts!, level_percent };
      })
      .filter((r) => r.ts != null)
      .sort((a, b) => a.ts - b.ts);
  }, []);

  /** Cargar historial: últimos 24h (fallback a 7d si vacío) */
  const loadHistory = React.useCallback(
    async (id: number) => {
      setLoading(true);
      setError(null);
      try {
        const since24 = new Date(Date.now() - DAY_MS).toISOString();

        // 1) pedir últimos 24h
        const base = getApiBase();
        const key = getApiKey();
        const url24 = `${base}/tanks/${id}/history?flat=true&order=asc&limit=5000&since=${encodeURIComponent(
          since24
        )}`;
        let res = await fetch(url24, {
          headers: {
            Accept: "application/json",
            "X-API-Key": String(key),
            Authorization: `Bearer ${String(key)}`,
          },
        });

        let j: any = [];
        try { j = await res.json(); } catch { j = []; }
        let rows = parseRows(j);

        // 2) si no hay nada, pedimos 7 días
        if (rows.length === 0) {
          const since7 = new Date(Date.now() - 7 * DAY_MS).toISOString();
          const url7 = `${base}/tanks/${id}/history?flat=true&order=asc&limit=5000&since=${encodeURIComponent(
            since7
          )}`;
          res = await fetch(url7, {
            headers: {
              Accept: "application/json",
              "X-API-Key": String(key),
              Authorization: `Bearer ${String(key)}`,
            },
          });
          try { j = await res.json(); } catch { j = []; }
          rows = parseRows(j);
        }

        // 3) filtrá a 24h y **cortá gaps** para no unir cuando el sensor estuvo offline
        const cutoff = Date.now() - DAY_MS;
        const lastDay = rows.filter((r) => r.ts >= cutoff);
        const finalRows = injectMissingGaps(lastDay.length ? lastDay : rows);

        setData(finalRows);
        setLastUpdate(Date.now());
      } catch (e: any) {
        setError(e?.message || `Error cargando historial del tanque ${id}`);
        setData([]);
      } finally {
        setLoading(false);
      }
    },
    [parseRows]
  );

  React.useEffect(() => {
    if (tankId != null) loadHistory(tankId);
  }, [tankId, loadHistory]);

  /** Auto-refresh cada 30s */
  React.useEffect(() => {
    if (tankId == null) return;
    const iv = setInterval(() => loadHistory(tankId), 30_000);
    return () => clearInterval(iv);
  }, [tankId, loadHistory]);

  const fmtTick = (t: number) =>
    new Date(Number(t)).toLocaleString("es-AR", { hour12: false });

  return (
    <div className="p-6 bg-white border border-slate-200 rounded-2xl space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="font-semibold text-slate-800">Niveles de tanques</h2>

        <select
          className="px-2 py-1 border border-slate-300 rounded text-sm"
          value={tankId ?? ""}
          onChange={(e) => setTankId(Number(e.target.value))}
        >
          {tanks.length === 0 ? (
            <option value={1}>TK-1</option>
          ) : (
            tanks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name ?? `TK-${t.id}`} (id {t.id})
              </option>
            ))
          )}
        </select>

        <span className="text-xs text-slate-500">
          {loading
            ? "Actualizando…"
            : error
            ? `⚠️ ${error}`
            : `Puntos: ${data.length}${
                lastUpdate
                  ? ` • Última: ${new Date(lastUpdate).toLocaleTimeString(
                      "es-AR",
                      { hour12: false }
                    )}`
                  : ""
              }`}
        </span>
      </div>

      {data.length === 0 && !loading ? (
        <div className="text-slate-500 text-sm p-6 border border-dashed rounded-lg">
          No hay datos recientes para el tanque seleccionado.
        </div>
      ) : (
        <div style={{ width: "100%", height: 440 }}>
          <ResponsiveContainer>
            <AreaChart
              data={data}
              margin={{ top: 10, right: 20, left: 10, bottom: 30 }}
            >
              <defs>
                <linearGradient id="lvGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.05} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" />

              {/* Bandas de umbrales (sin labels) */}
              <ReferenceArea y1={0} y2={lowLow} fill="#ef4444" fillOpacity={0.08} />
              <ReferenceArea y1={lowLow} y2={low} fill="#f59e0b" fillOpacity={0.08} />
              <ReferenceArea y1={high} y2={highHigh} fill="#f59e0b" fillOpacity={0.08} />
              <ReferenceArea y1={highHigh} y2={100} fill="#ef4444" fillOpacity={0.08} />

              {/* Líneas de umbral (sin texto lateral) */}
              <ReferenceLine y={lowLow} stroke="#ef4444" strokeDasharray="4 4" />
              <ReferenceLine y={low} stroke="#f59e0b" strokeDasharray="4 4" />
              <ReferenceLine y={high} stroke="#f59e0b" strokeDasharray="4 4" />
              <ReferenceLine y={highHigh} stroke="#ef4444" strokeDasharray="4 4" />

              <XAxis
                dataKey="ts"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={fmtTick}
                minTickGap={40}
              />
              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />

              <Tooltip
                formatter={(val: any, name: string) =>
                  name === "level_percent"
                    ? [
                        val == null
                          ? "sin dato"
                          : `${(val as number).toFixed?.(1) ?? val}%`,
                        "Nivel",
                      ]
                    : [val, name]
                }
                labelFormatter={(t) =>
                  `Hora: ${new Date(Number(t)).toLocaleString("es-AR", {
                    hour12: false,
                  })}`
                }
                wrapperStyle={{ fontSize: 12 }}
              />

              <Area
                type="monotone"
                dataKey="level_percent"
                name="Nivel"
                stroke="#06b6d4"
                fill="url(#lvGrad)"
                strokeWidth={2}
                isAnimationActive={false}
                dot={false}
                connectNulls={false}  // ← con los null inyectados, ya no une gaps
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
