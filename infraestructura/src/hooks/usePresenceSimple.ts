// hooks/usePresenceSimple.ts
import { useEffect, useRef, useState } from "react";
import { fetchPresenceSimple, PresenceItem } from "@/lib/presence";

export function usePresenceSimple(apiRoot: string, pollMs = 10000) {
  const [tick, setTick] = useState(0);
  const mapRef = useRef(new Map<string, PresenceItem>());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const arr = await fetchPresenceSimple(apiRoot);
        if (!cancelled) {
          arr.forEach(i => mapRef.current.set(i.node_id, i));
          setTick(x => x + 1);
        }
      } catch {}
    }
    load();
    const id = setInterval(load, pollMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [apiRoot, pollMs]);

  const get = (nodeId: string) => mapRef.current.get(nodeId);
  return { get, tick }; // usar 'tick' para re-render mínimo
}
