// src/components/kpi/KpiContent.tsx
import React from "react";
import { Button } from "@/components/ui/button";
import mock from "./mock";
import { buildPowerFromIsOn, tempStats, tankStats } from "./utils";
import OperacionView from "./views/OperacionView";
import EficienciaView from "./views/EficienciaView";
import ConfiabilidadView from "./views/ConfiabilidadView";
import CalidadView from "./views/CalidadView";
import GestionView from "./views/GestionView";


buildPowerFromIsOn(mock);

export default function KpiContent() {
  const [tab, setTab] = React.useState<"operacion"|"eficiencia"|"confiabilidad"|"calidad"|"gestion">("operacion");
  const [loc, setLoc] = React.useState<number|"all">("all");

  const filtered = React.useMemo(() => {
    if (loc === "all") return mock;
    const keepLoc = (x:any)=> x.location_id === loc;
    return {
      ...mock,
      byLocation: mock.byLocation.filter(keepLoc),
      assets: {
        ...mock.assets,
        tanks: mock.assets.tanks.filter(keepLoc),
        pumps: mock.assets.pumps.filter(keepLoc),
        valves: mock.assets.valves.filter(keepLoc),
        manifolds: mock.assets.manifolds.filter(keepLoc),
      },
    };
  }, [loc]);

  const defaultTankId = filtered.assets.tanks[0]?.id ?? 1;
  const defaultPumpId = filtered.assets.pumps[0]?.id ?? 101;
  const tanksTS = mock.timeseries.tanks as Record<string, any>;
  const pumpsTS = mock.timeseries.pumps as Record<string, any>;
  const tankTs = tanksTS[String(defaultTankId)];
  const pumpTs = pumpsTS[String(defaultPumpId)];

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">KPIs — Preview</h1>
        <div className="text-sm text-gray-500">{mock.org.name}</div>
      </header>

      <div className="flex gap-2 items-center">
        <span className="text-sm text-gray-500">Ubicación:</span>
        <select className="border rounded-xl p-2 text-sm" value={loc}
          onChange={(e)=> setLoc(e.target.value === "all" ? "all" : Number(e.target.value))}>
          <option value="all">Todas</option>
          {mock.locations.map((l:any)=>(
            <option key={l.location_id} value={l.location_id}>
              {l.location_name} ({l.location_code})
            </option>
          ))}
        </select>
        <Button className="ml-2" onClick={()=> console.log("[Preview] DATA", filtered)}>Loggear DATA</Button>
      </div>

      <div className="flex gap-2 border-b overflow-x-auto">
        {[
          {id:"operacion",label:"Operación"},
          {id:"eficiencia",label:"Eficiencia energética"},
          {id:"confiabilidad",label:"Operación y confiabilidad"},
          {id:"calidad",label:"Proceso y calidad del agua"},
          {id:"gestion",label:"Gestión global"},
        ].map(t=>(
          <button key={t.id} onClick={()=> setTab(t.id as any)}
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab===t.id? "border-gray-900 font-medium":"border-transparent text-gray-500"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab==="operacion" && <OperacionView data={mock} tankTs={tankTs} pumpTs={pumpTs} />}
      {tab==="eficiencia" && <EficienciaView data={filtered} pumpId={defaultPumpId} />}
      {tab==="confiabilidad" && <ConfiabilidadView pumpTs={pumpTs} alarms={mock.alarms} />}
      {tab==="calidad" && <CalidadView tankTs={tankTs} />}
      {tab==="gestion" && <GestionView data={mock} byLocation={filtered.byLocation} />}
    </div>
  );
}
