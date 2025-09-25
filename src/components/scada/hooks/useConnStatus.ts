// src/hooks/useConnStatus.ts
import { useEffect, useMemo, useRef, useState } from "react";
import { connectTelemetryWS, onWS, isWSOnline } from "../lib/ws";

// mismo tipo que usás en TankCard/PumpCard
export type ConnStatus = { online: boolean; ageSec: number; tone: "ok" | "warn" | "bad" };

// Umbrales de presencia (ajustá a gusto)
const WARN_AFTER_SEC = 30;   // Conectado pero sin latidos recientes -> warn
const OFF_AFTER_SEC  = 90;   // Sin latidos por mucho -> offline/bad

export function useConnStatus(pollMs = 1000): ConnStatus {
  // guarda el timestamp del último mensaje recibido por WS
  const lastTsRef = useRef<number>(Date.now());
  const [ageSec, setAgeSec] = useState(0);
  const [onlineFlag, setOnlineFlag] = useState<boolean>(isWSOnline());

  useEffect(() => {
    // aseguro que el WS esté abierto (idempotente)
    connectTelemetryWS();

    // cada mensaje recibido resetea el "last seen"
    const off = onWS((m: any) => {
      lastTsRef.current = Date.now();

      // si el backend manda {type:"status", online:boolean}, lo respeto
      if (m && m.type === "status" && typeof m.online === "boolean") {
        setOnlineFlag(!!m.online);
      } else {
        // fallback: uso el flag interno
        setOnlineFlag(isWSOnline());
      }
    });

    const id = setInterval(() => {
      const sec = Math.max(0, Math.round((Date.now() - lastTsRef.current) / 1000));
      setAgeSec(sec);
      // no cierro el WS al desmontar este hook para no "matar" a otros consumidores
    }, pollMs);

    return () => {
      off();
      clearInterval(id);
    };
  }, [pollMs]);

  // Derivo estado final:
  // - si no hubo latidos por mucho tiempo, fuerzo offline aunque isWSOnline() diga true
  const computedOnline = onlineFlag && ageSec < OFF_AFTER_SEC;

  const tone: ConnStatus["tone"] = !computedOnline
    ? "bad"
    : ageSec < WARN_AFTER_SEC
    ? "ok"
    : "warn";

  return { online: computedOnline, ageSec, tone };
}
