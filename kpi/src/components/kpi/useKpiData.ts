// src/components/kpi/useKpiData.ts
import { mock } from "./mock";
import type { KpiPayload, PumpTS, TankTS } from "./types";
import { devAssert } from "./utils";

export function useKpiData(): {
  data: KpiPayload;
  tankTs?: TankTS;
  pumpTs?: PumpTS;
} {
  // arregla el error de TS con import.meta.env
  const SOURCE = String((import.meta as any).env?.VITE_KPI_SOURCE ?? "mock").toLowerCase();

  // por ahora sólo “mock”; después acá enchufamos fetch a tu backend
  devAssert(SOURCE === "mock", `Fuente no soportada: ${SOURCE}`);

  const data = mock;

  const tanksTS = data.timeseries.tanks as Record<string, TankTS>;
  const pumpsTS = data.timeseries.pumps as Record<string, PumpTS>;

  const defaultTankId = data.assets.tanks?.[0]?.id ?? 1;
  const defaultPumpId = data.assets.pumps?.[0]?.id ?? 101;

  const tankTs = tanksTS[String(defaultTankId)];
  const pumpTs = pumpsTS[String(defaultPumpId)];

  return { data, tankTs, pumpTs };
}
