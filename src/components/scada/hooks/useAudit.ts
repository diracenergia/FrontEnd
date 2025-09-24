import React from "react";
import { api } from "../../../lib/api";
import type { AuditEvent } from "../../../lib/api";

export function useAudit(pollMs = 15000) {
  const [rows, setRows] = React.useState<AuditEvent[]>([]);

  const load = React.useCallback(async () => {
    try {
      const r = await api.auditList({ limit: 100 });
      setRows(r);
    } catch (e) {
      // Silencioso: ya vemos auditoría en la pestaña
      console.error("[audit] load error", e);
    }
  }, []);

  React.useEffect(() => {
    let alive = true;
    load();
    const t = setInterval(() => alive && load(), pollMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [load, pollMs]);

  return { rows, reloadAudit: load };
}
