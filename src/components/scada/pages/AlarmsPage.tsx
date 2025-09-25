import React from "react";
import { Badge } from "../ui";
import { hasPerm } from "../rbac";
import { api } from "../../../lib/api";
import type { Alarm } from "../types";


export function AlarmsPage({ plant, setPlant, user, onAudit }: any) {
  const rows: Alarm[] = (Array.isArray(plant?.alarms) ? plant.alarms : []).filter(Boolean);
  const [busyId, setBusyId] = React.useState<number | null>(null);

  const acknowledge = async (alarm: Alarm) => {
    const permitted = hasPerm(user, "canAck");
    onAudit?.({
      action: "ACK_ALARM",
      asset: `${alarm?.asset_type}-${alarm?.asset_id}`,
      details: alarm?.id,
      result: permitted ? "ok" : "denied",
    });
    if (!permitted) return;

    try {
      setBusyId(alarm.id);
      await api.ackAlarm(alarm.id, { user: user.name, note: "Reconocida desde UI" });
      const refreshed = await api.listAlarms(true);
      setPlant((prev: any) => ({ ...prev, alarms: refreshed }));
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "No se pudo reconocer la alarma");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <div className="font-medium">Alarmas</div>
        <div className="text-xs text-slate-500">
          {rows.length} {rows.length === 1 ? "total" : "totales"}
        </div>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left p-3">Hora</th>
              <th className="text-left p-3">Equipo</th>
              <th className="text-left p-3">Código</th>
              <th className="text-left p-3">Mensaje</th>
              <th className="text-left p-3">Severidad</th>
              <th className="text-left p-3">Estado</th>
              <th className="text-right p-3">Acción</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-3 text-center text-slate-400">
                  Sin alarmas activas
                </td>
              </tr>
            ) : (
              rows.map((r, i) => {
                const equipo =
                  r?.asset_type === "tank"
                    ? `TK-${r?.asset_id}`
                    : r?.asset_type === "pump"
                    ? `PU-${r?.asset_id}`
                    : `${r?.asset_type ?? "asset"}-${r?.asset_id ?? "?"}`;

                const code = String(r?.code ?? "").toUpperCase();
                const msg = r?.message ?? (code ? `Alarma ${code}` : "Alarma");
                const ts = r?.ts_raised ? new Date(r.ts_raised).toLocaleString() : "—";

                const severity = (r?.severity ?? "info") as "critical" | "warning" | "info";
                const sevTone: "ok" | "warn" | "bad" =
                  severity === "critical" ? "bad" : severity === "warning" ? "warn" : "ok";
                const sevText = String(severity).toUpperCase();

                const isActive = r?.is_active ?? true;
                const isAcked = !!r?.ack_by;

                return (
                  <tr key={r?.id ?? `row-${i}`} className="border-t border-slate-100">
                    <td className="p-3 whitespace-nowrap tabular-nums">{ts}</td>
                    <td className="p-3">{equipo}</td>
                    <td className="p-3">{code || "—"}</td>
                    <td className="p-3">{msg}</td>
                    <td className="p-3">
                      <Badge tone={sevTone}>{sevText}</Badge>
                    </td>
                    <td className="p-3">
                      {!isActive ? "Cerrada" : isAcked ? `Reconocida (${r.ack_by})` : "Activa"}
                    </td>
                    <td className="p-3 text-right">
                      {isActive && !isAcked ? (
                        <button
                          onClick={() => acknowledge(r)}
                          disabled={busyId === r?.id}
                          className="px-3 py-1.5 rounded-lg bg-slate-900 text-white disabled:bg-slate-200 disabled:text-slate-400"
                        >
                          {busyId === r?.id ? "…" : "ACK"}
                        </button>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
