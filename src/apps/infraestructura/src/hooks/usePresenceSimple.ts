import { useEffect, useRef, useState } from "react";
import { fetchPresenceSimple, PresenceItem } from "@/lib/presence";

/**
 * Hace poll a /conn/simple y mantiene un Map node_id -> PresenceItem.
 * apiRoot: base del backend (ej: "http://127.0.0.1:8000" o "https://backend.onrender.com")
 * pollMs: intervalo de sondeo en ms (default 10s)
 */
export function usePresenceSimple(apiRoot: string, pollMs = 10000) {
  const [tick, setTick] = useState(0);
  const mapRef = useRef(new Map<string, PresenceItem>());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const arr = await fetchPresenceSimple(apiRoot);
        if (!cancelled) {
          mapRef.current.clear(); // snapshot fresco
          for (const i of arr) mapRef.current.set(i.node_id, i);
          setTick(x => x + 1);
        }
      } catch {
        // silencio: dejamos último estado conocido
      }
    }

    load();
    const id = setInterval(load, pollMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [apiRoot, pollMs]);

  const get = (nodeId: string) => mapRef.current.get(nodeId);
  return { get, tick };
}
