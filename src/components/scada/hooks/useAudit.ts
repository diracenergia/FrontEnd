import * as React from "react";
import { api } from "../../../lib/api";

const isNetErr = (e: any) => /Failed to fetch|NetworkError|TypeError: Network|AbortError/i.test(String(e?.message || e));

export function useAudit() {
  const [rows, setRows] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.auditList({ limit: 100 }).catch((e) => {
        if (isNetErr(e)) return []; // fallback silencioso en error de red
        throw e;
      });
      setRows(data ?? []);
      setErr(null);
    } catch (e: any) {
      console.warn("[audit] load error", e);
      // Mostrá el error sólo si querés; si no, comentá la línea de abajo:
      // setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return { rows, loading, err, reload: load };
}
