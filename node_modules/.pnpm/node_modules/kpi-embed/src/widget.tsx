// src/widget.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Button } from "./components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "./components/ui/card";
import { KPI } from "./components/KPI";
import TankLevelChart from "./components/TankLevelChart";
import PumpsOnChart from "./components/PumpsOnChart";
import ByLocationTable from "./components/ByLocationTable";
import { Tabs } from "./components/Tabs";
import { useLocationFilter } from "./hooks/useLocationFilter"; // (lo podés quitar si no lo usás)
import { loadDashboard } from "@/data/loadFromApi";
import { k } from "./utils/format";
import ActiveAlarms from "./components/ActiveAlarms";
import EnergyEfficiencyPage from "./components/EnergyEfficiencyPage";
import ReliabilityPage from "./components/ReliabilityPage";
import { currentKpiCtx } from "./lib/kpiConfig"; // 👈 toma locationId inicial del host

type Props = { title?: string };

export default function KpiWidget({ title }: Props) {
  const [live, setLive] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("operacion");

  // Inicializar ubicación desde el ctx del host
  const initialLoc = (() => {
    try {
      const { locationId } = currentKpiCtx();
      return typeof locationId === "number" ? locationId : "all";
    } catch {
      return "all";
    }
  })();
  const [loc, setLoc] = useState<number | "all">(initialLoc);

  // 1) carga inicial y recarga al cambiar loc
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const data = await loadDashboard(loc);
        if (mounted) setLive(data);
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loc]);

  // 2) sincronizar con cambios de contexto emitidos por el host
  useEffect(() => {
    const on = (e: any) => {
      const id = e?.detail?.locationId;
      setLoc(typeof id === "number" ? id : "all");
    };
    window.addEventListener("rdls:ctx-changed", on);
    return () => window.removeEventListener("rdls:ctx-changed", on);
  }, []);

  const locations = live?.locations || [];
  const byLocation = live?.byLocation || [];
  const pumpAgg = live?.pumpTs || null;
  const tankAgg = live?.tankTs || null;
  const alarms = live?.overview?.alarms || [];

  // KPIs sumando por ubicación + alarmas
  const kpis = useMemo(() => {
    let tanks = 0, pumps = 0, valves = 0, manifolds = 0;
    for (const r of byLocation) {
      tanks += Number(r?.tanks_count ?? 0);
      pumps += Number(r?.pumps_count ?? 0);
      valves += Number(r?.valves_count ?? 0);
      manifolds += Number(r?.manifolds_count ?? 0);
    }
    const assets_total = tanks + pumps + valves + manifolds;

    const alarms_active = (Array.isArray(alarms) ? alarms : []).reduce(
      (acc: number, a: any) => acc + Number(a?.count ?? 0),
      0
    );

    const avg_level_24h =
      Array.isArray(tankAgg?.level_percent) && tankAgg.level_percent.length
        ? tankAgg.level_percent.reduce((a: number, b: number) => a + Number(b ?? 0), 0) /
          Math.max(1, tankAgg.level_percent.length)
        : null;

    const pumps_on_now =
      Array.isArray(pumpAgg?.is_on) && pumpAgg.is_on.length
        ? Number(pumpAgg.is_on[pumpAgg.is_on.length - 1] ?? 0)
        : 0;

    return { assets_total, tanks, pumps, valves, manifolds, alarms_active, avg_level_24h, pumps_on_now };
  }, [byLocation, alarms, pumpAgg, tankAgg]);

  return (
    <div className="p-6 space-y-6">
      {/* Título opcional (si el host lo envía) */}
      {title ? (
        <div className="mb-2 text-lg font-semibold tracking-tight">{title}</div>
      ) : null}

      <div className="flex gap-2 items-center">
        <span className="text-sm text-gray-500">Ubicación:</span>
        <select
          className="border rounded-xl p-2 text-sm"
          value={loc}
          onChange={(e) => {
            const v = e.target.value;
            setLoc(v === "all" ? "all" : Number(v));
          }}
        >
          <option value="all">Todas</option>
          {(Array.isArray(locations) ? locations : []).map((l: any, i: number) => {
            const key = String(l?.id ?? l?.code ?? l?.name ?? i);
            const value = Number.isFinite(Number(l?.id)) ? Number(l.id) : i + 1;
            const name = l?.name ?? (l?.code ?? `Ubicación ${i + 1}`);
            const code = l?.code ? ` (${l.code})` : "";
            return (
              <option key={key} value={value}>
                {name}{code}
              </option>
            );
          })}
        </select>
        <Button className="ml-2" onClick={() => console.log("[LIVE]", live)}>
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
          <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <KPI label="Tanques" value={k(kpis.tanks)} />
            <KPI label="Bombas" value={k(kpis.pumps)} />
            <KPI label="Valv." value={k(kpis.valves)} />
            <KPI label="Alarmas activas" value={k(kpis.alarms_active)} />
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TankLevelChart ts={tankAgg} />
            <PumpsOnChart pumpsTs={pumpAgg} />
            <ActiveAlarms locationId={loc === "all" ? "all" : Number(loc)} refreshMs={30000} />
          </section>
        </>
      )}

      {/* Eficiencia */}
      {tab === "eficiencia" && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Izquierda: gráfico + tarjetas Valle/Resto/Pico */}
          <EnergyEfficiencyPage pumpAgg={pumpAgg} debug />

          {/* Derecha: notas */}
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-500">Notas</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1">
                <li>Bandas EPEN por defecto: <b>VALLE</b> 00–07 h, <b>PICO</b> 19–23 h (incluye 23), <b>RESTO</b> el resto.</li>
                <li>Las tarjetas muestran horas-bomba y % por franja (24 h).</li>
                <li>El selector de ubicación arriba recarga los datos y esta vista se actualiza sola.</li>
              </ul>
            </CardContent>
          </Card>
        </section>
      )}

      {tab === "confiabilidad" && (
        <ReliabilityPage locationId={loc === "all" ? "all" : Number(loc)} thresholdLow={90} />
      )}

      <section>
        <Card className="rounded-2xl">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Resumen por ubicación</CardTitle>
          </CardHeader>
          <CardContent>
            <ByLocationTable rows={byLocation} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
