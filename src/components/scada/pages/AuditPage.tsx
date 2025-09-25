import React from "react";
import { Badge } from "../ui";
import type { AuditEvent } from "../types"; // <-- o cambiá a "../../../lib/api" si ahí está el tipo


export function AuditPage({ audit }: { audit: AuditEvent[] }) {
  const rows = Array.isArray(audit) ? audit : [];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <div className="font-medium">Auditoría (últimas acciones)</div>
        <div className="text-xs text-slate-500">
          {rows.length} {rows.length === 1 ? "evento" : "eventos"}
        </div>
      </div>

      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left p-3">Hora</th>
              <th className="text-left p-3">Usuario</th>
              <th className="text-left p-3">Rol</th>
              <th className="text-left p-3">Acción</th>
              <th className="text-left p-3">Equipo</th>
              <th className="text-left p-3">Detalle</th>
              <th className="text-left p-3">Resultado</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-3 text-center text-slate-400">
                  Sin eventos
                </td>
              </tr>
            ) : (
              rows.map((ev) => {
                const asset = (ev as any).asset ?? `${(ev as any).asset_type}-${(ev as any).asset_id}`;
                const details =
                  typeof (ev as any).details === "string"
                    ? (ev as any).details
                    : (ev as any).details != null
                    ? JSON.stringify((ev as any).details)
                    : "";

                const tone =
                  (ev as any).result === "ok" ? "ok" : (ev as any).result === "denied" ? "bad" : "warn";

                return (
                  <tr
                    key={`${(ev as any).ts}-${asset}-${(ev as any).action}-${(ev as any).state}`}
                    className="border-t border-slate-100"
                  >
                    <td className="p-3 whitespace-nowrap">
                      {new Date((ev as any).ts).toLocaleString()}
                    </td>
                    <td className="p-3">{(ev as any).user ?? "—"}</td>
                    <td className="p-3">{(ev as any).role ?? "—"}</td>
                    <td className="p-3">{(ev as any).action ?? "—"}</td>
                    <td className="p-3">{asset}</td>
                    <td className="p-3">{details}</td>
                    <td className="p-3">
                      <Badge tone={tone as any}>
                        {(((ev as any).result ?? "—") as string).toString().toUpperCase()}
                      </Badge>
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
