import React from "react";
import { Badge, KeyVal } from "../ui";
import { hasPerm } from "../rbac";
import { api } from "../../../lib/api";

function clampInt(n: any, mn = 0, mx = 100) {
  const v = Number.isFinite(n) ? Math.round(n) : 0;
  return Math.max(mn, Math.min(mx, v));
}
function fmtDrive(dt: any) {
  return dt === "vfd" ? "Variador (VFD)" : dt === "soft" ? "Arranque suave" : "Directo";
}

export function PumpFaceplate({ pump, user, onAudit }: any) {
  const pumpNumId = pump.pumpId ?? pump.id;

  const driveType: "direct" | "soft" | "vfd" | null =
    pump.driveType ?? pump.drive_type ?? pump.config?.drive_type ?? null;
  const remoteEnabled: boolean =
    (pump.remoteEnabled ?? pump.remote_enabled ?? pump.config?.remote_enabled ?? true) === true;

  // Derivar modo / lockout desde latest.extra del ESP32
  const extraObj = (() => {
    try {
      return typeof pump?.latest?.extra === "string"
        ? JSON.parse(pump.latest.extra)
        : (pump?.latest?.extra || {});
    } catch {
      return {};
    }
  })();

  const selectorStr = String(
    extraObj.selector_mode ??
      extraObj.selector ??
      extraObj.control_mode ??
      extraObj.modo ??
      extraObj.mode ??
      ""
  )
    .trim()
    .toLowerCase();

  const remoteFlag = extraObj.remote ?? extraObj.remote_enabled ?? extraObj.remoto;
  const remoteBool =
    typeof remoteFlag === "string"
      ? ["1", "true", "yes", "on", "auto", "remoto"].includes(remoteFlag.trim().toLowerCase())
      : remoteFlag === true || remoteFlag === 1;

  const manualFromExtra =
    selectorStr === "manual" ||
    selectorStr === "man" ||
    selectorStr === "local" ||
    selectorStr === "lockout" ||
    selectorStr === "lock-out" ||
    extraObj.local === true ||
    extraObj.lockout === true ||
    remoteBool === false;

  const mode: "auto" | "manual" =
    (pump.mode as "auto" | "manual" | undefined) || (manualFromExtra ? "manual" : "auto");

  const manualLockout: boolean =
    (pump.control?.manual_lockout ?? pump.latest?.manual_lockout ?? manualFromExtra) === true;

  const vfdMin = pump.vfd?.min ?? pump.vfd_min_speed_pct ?? pump.config?.vfd_min_speed_pct ?? 0;
  const vfdMax = pump.vfd?.max ?? pump.vfd_max_speed_pct ?? pump.config?.vfd_max_speed_pct ?? 100;
  const vfdDefault =
    pump.vfd?.def ?? pump.vfd_default_speed_pct ?? pump.config?.vfd_default_speed_pct ?? 50;

  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const [speed, setSpeed] = React.useState<number>(clampInt(vfdDefault, vfdMin, vfdMax));

  const canCommand = hasPerm(user, "canCommand");
  const commandBlocked = !canCommand || !remoteEnabled || manualLockout || mode !== "auto";

  const stateTone: "ok" | "warn" | "bad" = pump.fault ? "bad" : pump.state === "run" ? "ok" : "warn";
  const stateText = pump.fault ? "FAULT" : pump.state === "run" ? "RUN" : "STOP";

  async function runCmd(kind: "START" | "STOP" | "SPEED") {
    setErr(null);
    setNote(null);
    if (onAudit) onAudit({ action: `CMD_${kind}`, asset: `PU-${pumpNumId}`, result: canCommand ? "ok" : "denied" });
    if (commandBlocked) return;
    try {
      setBusy(kind);
      let res: any;
      if (kind === "START") res = await api.startPump(pumpNumId, user?.name || "operador");
      else if (kind === "STOP") res = await api.stopPump(pumpNumId, user?.name || "operador");
      else if (kind === "SPEED") res = await api.speedPump(pumpNumId, clampInt(speed, vfdMin, vfdMax), user?.name || "operador");
      if (res && res.id) setNote(`Comando encolado (#${res.id})`);
      else setNote("Comando encolado");
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">{pump.name}</div>
        <Badge tone={stateTone}>{stateText}</Badge>
      </div>

      {/* Info + Config */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="p-4 bg-slate-50 rounded-xl text-sm">
          <KeyVal k="Modo" v={mode.toUpperCase()} />
          <KeyVal k="Horas" v={pump.hours?.toLocaleString?.() ?? "—"} />
          <KeyVal k="Caudal" v={`${pump.latest?.flow_lpm ?? "—"} L/min`} />
          <KeyVal k="Presión" v={`${pump.latest?.pressure_bar ?? "—"} bar`} />
          <KeyVal k="Voltaje" v={`${pump.latest?.voltage_v ?? "—"} V`} />
          <KeyVal k="Corriente" v={`${pump.latest?.current_a ?? "—"} A`} />
          <KeyVal k="Tipo" v={fmtDrive(driveType)} />
        </div>

        <div className="p-4 bg-slate-50 rounded-xl text-sm">
          <div className="text-slate-500 mb-2">Configuración</div>
          <div className="space-y-1">
            <KeyVal k="Remoto" v={remoteEnabled ? "Habilitado" : "Deshabilitado"} />
            <KeyVal k="Lock-out manual" v={manualLockout ? "Sí" : "No"} />
            {driveType === "vfd" && (
              <>
                <KeyVal k="VFD min" v={`${vfdMin}%`} />
                <KeyVal k="VFD max" v={`${vfdMax}%`} />
                <KeyVal k="VFD default" v={`${vfdDefault}%`} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Comandos */}
      <div className="p-4 bg-slate-50 rounded-xl">
        <div className="text-slate-500 mb-2">Comandos</div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => runCmd("START")}
            disabled={commandBlocked || busy !== null}
            className="px-3 py-1.5 rounded-xl bg-slate-900 text-white disabled:bg-slate-200 disabled:text-slate-400"
          >
            {busy === "START" ? "…" : "START"}
          </button>
          <button
            onClick={() => runCmd("STOP")}
            disabled={commandBlocked || busy !== null}
            className="px-3 py-1.5 rounded-xl bg-slate-200 disabled:opacity-50"
          >
            {busy === "STOP" ? "…" : "STOP"}
          </button>
        </div>

        {driveType === "vfd" && (
          <div className="mt-4 flex items-center gap-3">
            <div className="grow">
              <input
                type="range"
                min={vfdMin}
                max={vfdMax}
                step={1}
                value={speed}
                onChange={(e) => setSpeed(clampInt(Number((e.target as HTMLInputElement).value), vfdMin, vfdMax))}
                disabled={commandBlocked || busy !== null}
                className="w-full"
              />
              <div className="text-xs text-slate-500 mt-1">
                Setpoint: <span className="font-medium text-slate-700">{speed}%</span> (min {vfdMin} · max {vfdMax})
              </div>
            </div>
            <button
              onClick={() => runCmd("SPEED")}
              disabled={commandBlocked || busy !== null}
              className="px-3 py-1.5 rounded-xl bg-slate-900 text-white disabled:bg-slate-200 disabled:text-slate-400"
            >
              {busy === "SPEED" ? "…" : "Enviar"}
            </button>
          </div>
        )}

        {err && (
          <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {err}
          </div>
        )}
        {!err && commandBlocked && (
          <div className="mt-3 text-xs text-slate-500">
            {(mode !== "auto" && "Selector en MANUAL — controles deshabilitados.") ||
              (manualLockout && "Lock-out manual activo.") ||
              (!remoteEnabled && "Remoto deshabilitado en config.") ||
              (!canCommand && "No tenés permisos para operar.")}
          </div>
        )}
        {note && !err && !commandBlocked && (
          <div className="mt-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            {note}
          </div>
        )}
      </div>
    </div>
  );
}
