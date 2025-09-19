// src/components/kpi/filters/FiltersProvider.tsx
import React, { createContext, useContext, useState } from "react";

export type TimeWindow = "24h" | "7d" | "30d";

type FiltersState = {
  locationId: number | "all";
  window: TimeWindow;
  pumpId: number | null;
  tankId: number | null;
};

type FiltersCtx = FiltersState & {
  setLocationId: (id: number | "all") => void;
  setWindow: (w: TimeWindow) => void;
  selectPump: (id: number | null) => void;
  selectTank: (id: number | null) => void;
  clearSelections: () => void;
};

const Ctx = createContext<FiltersCtx | null>(null);

export function KpiFiltersProvider({
  initialLocation = "all",
  children,
}: {
  initialLocation?: number | "all";
  children: React.ReactNode;
}) {
  const [locationId, setLocationId] = useState<number | "all">(initialLocation);
  const [window, setWindow] = useState<TimeWindow>("24h");
  const [pumpId, setPumpId] = useState<number | null>(null);
  const [tankId, setTankId] = useState<number | null>(null);

  const value: FiltersCtx = {
    locationId,
    window,
    pumpId,
    tankId,
    setLocationId: (id) => {
      setLocationId(id);
      // al cambiar ubicación, limpiamos selecciones
      setPumpId(null);
      setTankId(null);
    },
    setWindow,
    selectPump: setPumpId,
    selectTank: setTankId,
    clearSelections: () => {
      setPumpId(null);
      setTankId(null);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useKpiFilters(): FiltersCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useKpiFilters must be used within KpiFiltersProvider");
  return ctx;
}
