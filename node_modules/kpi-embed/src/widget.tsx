import React, { useEffect, useMemo, useState } from "react";

// UI (shadcn)
import { Button } from "./components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "./components/ui/card";

// Componentes atómicos
import { KPI } from "./components/KPI";
import { TankLevelChart } from "./components/TankLevelChart";
import { PumpsOnChart } from "./components/PumpsOnChart";
import { EnergyEfficiency } from "./components/EnergyEfficiency";
import { ByLocationTable } from "./components/ByLocationTable";
import { Tabs } from "./components/Tabs";

// Hooks y datos
import { useLocationFilter } from "./hooks/useLocationFilter";
import { loadDashboard } from "./data/loadDashboard";
import { MOCK_DATA } from "./data/mock";

// Utils
import { k, pct } from "./utils/format";
import {
  tankStats,
  tempStats,
  turnoverEstimatePerDay,
  criticalResolvedUnder24h,
} from "./utils/stats";

export function KpiWidget() {
  const [live, setLive] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await loadDashboard();
        if (mounted) setLive(data);
      } catch (e: any) {
        if (mounted) setError(e?.message || "Error al cargar datos");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Usamos overview como fuente principal
  const overview = live?.overview || (MOCK_DATA as any).overview || {};
  const locations = live?.locations || (MOCK_DATA as any).locations || [];
  const serverByLocation: any[] = Array.isArray(live?.byLocation) ? live!.byLocation : [];

  // Filtro por ubicación
  const { loc, setLoc, filtered } = useLocationFilter({ overview, locations });

  const defaultTankId =
    filtered?.overview?.assets?.tanks?.[0]?.id ?? overview?.assets?.tanks?.[0]?.id ?? null;
  const defaultPumpId =
    filtered?.overview?.assets?.pumps?.[0]?.id ?? overview?.assets?.pumps?.[0]?.id ?? null;

  const tankTs =
    (defaultTankId &&
      (filtered?.overview?.timeseries?.tanks?.[String(defaultTankId)] ??
        overview?.timeseries?.tanks?.[String(defaultTankId)])) ||
    null;

  const pumpTs =
    (defaultPumpId &&
      (filtered?.overview?.timeseries?.pumps?.[String(defaultPumpId)] ??
        overview?.timeseries?.pumps?.[String(defaultPumpId)])) ||
    null;

  const [tab, setTab] = useState("operacion");

  function ConfiabilidadView() {
    const isOn: boolean[] = (pumpTs?.is_on as boolean[]) || [];
    const starts = isOn.reduce((acc, v, i) => (i > 0 && !isOn[i - 1] && v ? acc + 1 : acc), 0);
    const avail = (isOn.filter(Boolean).length / Math.max(1, isOn.length)) * 100;

    const avgOn = useMemo(() => {
      let total = 0,
        runs = 0,
        current = 0;
      for (let i = 0; i < isOn.length; i++) {
        if (isOn[i]) current++;
        if ((i === isOn.length - 1 || !isOn[i]) && current > 0) {
          total += current;
          runs++;
          current = 0;
        }
      }
      return runs ? total / runs : 0;
    }, [isOn]);

    const mtba = useMemo(() => {
      const alarms = (overview?.alarms as any[]) || [];
      if (!alarms || alarms.length < 2) return null;
      const times = alarms
        .map((a: any) => new Date(a.ts_raised).getTime())
        .filter((n: number) => Number.isFinite(n))
        .sort((a, b) => a - b);
      if (times.length < 2) return null;
      let gaps = 0,
        sum = 0;
      for (let i = 1; i < times.length; i++) {
        sum += times[i] - times[i - 1];
        gaps++;
      }
      return sum / Math.max(1, gaps) / 3600000;
    }, [overview?.alarms]);

    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <KPI label="Disponibilidad (24h)" value={`${avail.toFixed(0)}%`} />
        <KPI label="Arranques/día" value={starts} />
        <KPI label="Tiempo medio por ciclo" value={`${avgOn.toFixed(1)} h`} />
        <Card className="rounded-2xl lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">MTBA (tiempo medio entre alarmas)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{mtba ? `${mtba.toFixed(1)} h` : "—"}</div>
            <div className="text-sm text-gray-500 mt-1">Calculado sobre histórico actual.</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  function CalidadView() {
    const stats = tankStats(tankTs);
    const temp = tempStats(tankTs);
    const turnover = turnoverEstimatePerDay(stats.range || 0);

    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <KPI label="Nivel medio (24h)" value={stats.mean != null ? `${stats.mean.toFixed(0)}%` : "—"} />
        <KPI
          label="Mín / Máx nivel"
          value={stats.min != null ? `${stats.min.toFixed(0)}% / ${stats.max.toFixed(0)}%` : "—"}
        />
        <KPI label="Renovación estimada" value={`${turnover.toFixed(0)}%/día`} />
        <Card className="rounded-2xl lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Temperatura del agua (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-gray-50 rounded-xl text-center">
                <div className="text-xs text-gray-500">Promedio</div>
                <div className="text-lg font-medium">{temp.mean != null ? `${temp.mean.toFixed(1)}°C` : "—"}</div>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl text-center">
                <div className="text-xs text-gray-500">Mínima</div>
                <div className="text-lg font-medium">{temp.min != null ? `${temp.min.toFixed(1)}°C` : "—"}</div>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl text-center">
                <div className="text-xs text-gray-500">Máxima</div>
                <div className="text-lg font-medium">{temp.max != null ? `${temp.max.toFixed(1)}°C` : "—"}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  function GestionView() {
    const { pct: pctCrit24h, total } = criticalResolvedUnder24h(overview?.alarms || []);
    // Top ubicaciones por kWh desde /kpi/by-location
    const top = useMemo(() => {
      const rows = serverByLocation || [];
      return rows
        .filter((r: any) => typeof r?.kwh_30d === "number")
        .sort((a: any, b: any) => (b.kwh_30d ?? 0) - (a.kwh_30d ?? 0))
        .slice(0, 10);
    }, [serverByLocation]);

    const offlineAssets = 0;

    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <KPI label="Críticas resueltas <24h" value={`${pctCrit24h.toFixed(0)}%`} sub={`${total} críticas`} />
        <KPI label="Activos fuera de servicio" value={offlineAssets} />
        <KPI label="Ubicaciones (Top energía)" value={top.length} />
        <Card className="rounded-2xl lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Top ubicaciones por consumo (kWh, 30d)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto max-h-60 border rounded-2xl">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left p-3">Ubicación</th>
                    <th className="text-left p-3">Código</th>
                    <th className="text-right p-3">kWh (30d)</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((r: any) => (
                    <tr key={r.location_id} className="border-t">
                      <td className="p-3">{r.location_name}</td>
                      <td className="p-3">{r.location_code}</td>
                      <td className="p-3 text-right">{(r.kwh_30d ?? 0).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasLive = !!live;
  const showBanner = (loading && !hasLive) || (error && !hasLive);

  const kpis = overview?.summary30d || {};
  const latestPumps = overview?.latest?.pumps || [];

  // KPI de nivel: puede venir string/num
  const avgLevel30 = (() => {
    const raw = kpis?.avg_level_pct_30d;
    const n = raw == null ? null : Number(raw);
    return Number.isFinite(n as number) ? (n as number) : null;
  })();

  // byLocation a pasar a la tabla:
  // preferimos el array del server; si no hay, hacemos un fallback mínimo con la location actual
  const byLocation = useMemo(() => {
    if (serverByLocation.length > 0) return serverByLocation;
    const loc = overview?.location;
    const s = overview?.summary30d || {};
    if (!loc) return [];
    const pumpsOnNow = (overview?.latest?.pumps || []).filter((p: any) => p?.is_on).length;
    return [
      {
        location_id: loc.id,
        location_code: loc.code,
        location_name: loc.name,
        pumps_count: s.pumps_count ?? 0,
        tanks_count: s.tanks_count ?? 0,
        valves_count: s.valves_count ?? 0,
        alarms_active: s.alarms_active ?? 0,
        pumps_on_now: pumpsOnNow,
        // sin dato de kWh por ubicación en overview: dejamos null
        kwh_30d: null,
      },
    ];
  }, [serverByLocation, overview]);

  return (
    <div className="p-6 space-y-6">
      {showBanner && (
        <div className="text-xs rounded-lg p-3 bg-amber-50 border border-amber-200 text-amber-800">
          {loading
            ? "Cargando datos del backend… (mostrando mocks provisionalmente)"
            : "No se pudo cargar desde el backend. Mostrando datos mock como fallback."}
        </div>
      )}

      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Widget — RDLS</h1>
        <div className="text-sm text-gray-500">{overview?.location?.name || "—"}</div>
      </header>

      <div className="flex gap-2 items-center">
        <span className="text-sm text-gray-500">Ubicación:</span>
        <select
          className="border rounded-xl p-2 text-sm"
          value={loc}
          onChange={(e) => setLoc(e.target.value === "all" ? "all" : Number(e.target.value))}
        >
          <option value="all">Todas</option>
          {locations.map((l: any, i: number) => {
            const keyBase = l?.id ?? l?.code ?? l?.name ?? "loc";
            const key = `${keyBase}-${i}`;
            return (
              <option key={key} value={l.id}>
                {l.name} ({l.code})
              </option>
            );
          })}
        </select>
        <Button className="ml-2" onClick={() => console.log("[Widget] DATA", { live, overview, byLocation })}>
          Loggear DATA
        </Button>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "operacion", label: "Operación" },
          { id: "eficiencia", label: "Eficiencia energética" },
          { id: "confiabilidad", label: "Operación y confiabilidad" },
          { id: "calidad", label: "Proceso y calidad del agua" },
          { id: "gestion", label: "Gestión global" },
        ]}
      />

      {tab === "operacion" && (
        <>
          <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KPI label="Activos" value={k(kpis.assets_total ?? 0)} />
            <KPI label="Tanques" value={k(kpis.tanks_count ?? 0)} />
            <KPI label="Bombas" value={k(kpis.pumps_count ?? 0)} />
            <KPI label="Valv." value={k(kpis.valves_count ?? 0)} />
            <KPI label="Alarmas activas" value={k(kpis.alarms_active ?? 0)} />
            <KPI
              label="Nivel prom. (30d)"
              value={avgLevel30 != null ? pct(avgLevel30) : "—"}
            />
            <KPI
              label="Bombas encendidas (ahora)"
              value={latestPumps.filter((p: any) => p?.is_on).length}
              sub="Conteo instantáneo"
            />
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TankLevelChart ts={tankTs} />
            <PumpsOnChart pumpsTs={overview?.timeseries?.pumps || {}} />
          </section>
        </>
      )}

      {tab === "eficiencia" && (
        <section className="grid grid-cols-1 lg:grid-cols-1 gap-4">
          {defaultPumpId ? (
            <EnergyEfficiency data={overview} pumpId={defaultPumpId} />
          ) : (
            <Card className="rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-500">Eficiencia</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-500">No hay bombas en esta ubicación.</CardContent>
            </Card>
          )}
        </section>
      )}

      {tab === "confiabilidad" && <ConfiabilidadView />}
      {tab === "calidad" && <CalidadView />}
      {tab === "gestion" && <GestionView />}

      <section>
        <Card className="rounded-2xl">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Resumen por ubicación</CardTitle>
          </CardHeader>
          <CardContent>
            <ByLocationTable
              data={{
                byLocation,
                latest: overview?.latest || {},
                assets: {
                  pumps: Array.isArray(overview?.assets?.pumps) ? overview.assets.pumps : [],
                },
              }}
            />
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Alarmas</CardTitle>
          </CardHeader>
        <CardContent>
            <div className="space-y-2">
              {(overview?.alarms || []).map((a: any) => (
                <div
                  key={a.id}
                  className={`flex items-center justify-between p-3 rounded-xl border ${
                    a.is_active ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200"
                  }`}
                >
                  <div className="text-sm">
                    <div className="font-medium">{a.message}</div>
                    <div className="text-gray-500">
                      {String(a.asset_type || "").toUpperCase()} #{a.asset_id} •{" "}
                      {a.ts_raised ? new Date(a.ts_raised).toLocaleString("es-AR") : "—"}
                    </div>
                  </div>
                  <div
                    className={`text-xs px-2 py-1 rounded-full ${
                      a.severity === "critical" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {a.severity}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

export default KpiWidget;
