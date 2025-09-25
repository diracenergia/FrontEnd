import React from "react";
import { Badge, KeyVal } from "../ui";
import { hasPerm } from "../rbac";
import { api } from "../../../lib/api";

function clampInt(n: any, mn = 0, mx = 100) {
  const v = Number.isFinite(n) ? Math.round(n) : 0;
  return Math.max(mn, Math.min(mx, v));
}

export function PumpFaceplate({ pump, user, onAudit }: any) {
  const pumpNumId = pump.pumpId ?? pump.id;

  const driveType: "direct" | "soft" | "vfd" | null =
    pump.driveType ?? pump.drive_type ?? pump.config?.drive_type ?? null;
  const remoteEnabled: boolean =
    (pump.remoteEnabled ?? pump.remote_enabled ?? pump.config?.remote_enabled ?? true) === true;

  // ===== Derivar modo / lockout desde latest.extra del ESP32 =====
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

  const [busy, setBusy] = React.useState<"START" | "STOP" | "SPEED" | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const [speed, setSpeed] = React.useState<number>(clampInt(vfdDefault, vfdMin, vfdMax));

  // UI de contraseña
  const [pendingCmd, setPendingCmd] = React.useState<null | "START" | "STOP">(null);
  const [pass, setPass] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const closingRef = React.useRef(false);

  const canCommand = hasPerm(user, "canCommand");
  const commandBlocked = !canCommand || !remoteEnabled || manualLockout || mode !== "auto";

  const stateTone: "ok" | "warn" | "bad" = pump.fault ? "bad" : pump.state === "run" ? "ok" : "warn";
  const stateText = pump.fault ? "FAULT" : pump.state === "run" ? "RUN" : "STOP";

  // ===== Ejecuta el comando (sin pedir password acá) =====
  async function executeCmd(kind: "START" | "STOP" | "SPEED") {
    setErr(null);
    setNote(null);
    if (onAudit) onAudit({ action: `CMD_${kind}`, asset: `PU-${pumpNumId}`, result: canCommand ? "ok" : "denied" });
    if (commandBlocked) return;

    try {
      setBusy(kind);
      let res: any;
      if (kind === "START") res = await api.startPump(pumpNumId, user?.name || "operador");
      else if (kind === "STOP") res = await api.stopPump(pumpNumId, user?.name || "operador");
      else if (kind === "SPEED")
        res = await api.speedPump(pumpNumId, clampInt(speed, vfdMin, vfdMax), user?.name || "operador");

      if (res && res.id) setNote(`Comando encolado (#${res.id})`);
      else setNote("Comando encolado");
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  // ===== Manejo de la UI de confirmación =====
  function onClickStartStop(kind: "START" | "STOP") {
    if (commandBlocked) return;
    setErr(null);
    setNote(null);
    setPendingCmd(kind);
    setPass("");
  }

  async function onSubmitPassword() {
    if (!pendingCmd) return;
    if (pass !== "1234") {
      setErr("Contraseña incorrecta.");
      // mantener foco para que el operador siga escribiendo
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    setErr(null);
    closingRef.current = true; // evita refocus por onBlur cuando cerramos
    const kind = pendingCmd;
    setPendingCmd(null);
    setPass("");
    await executeCmd(kind);
    // pequeño retraso antes de permitir refocus por si el padre re-renderiza
    setTimeout(() => (closingRef.current = false), 150);
  }

  // Enfocar siempre que el panel esté abierto
  React.useLayoutEffect(() => {
    if (pendingCmd) {
      inputRef.current?.focus();
    }
  }, [pendingCmd]);

  // Evitar que algún contenedor padre capture eventos y cierre el panel / cambie el foco
  const stopBubble = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <div className="p-4 space-y-4" onClick={stopBubble} onMouseDown={stopBubble} onKeyDown={stopBubble}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">{pump.name}</div>
        <Badge tone={stateTone}>{stateText}</Badge>
      </div>

      {/* Configuración (se mantiene) */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="p-4 bg-slate-50 rounded-xl text-sm">
          <div className="text-slate-500 mb-2">Configuración</div>
          <div className="space-y-1">
            <KeyVal k="Remoto" v={remoteEnabled ? "Habilitado" : "Deshabilitado"} />
            <KeyVal k="Lock-out manual" v={manualLockout ? "Sí" : "No"} />
            <KeyVal
              k="Tipo"
              v={driveType === "vfd" ? "Variador (VFD)" : driveType === "soft" ? "Arranque suave" : "Directo"}
            />
          </div>
        </div>
      </div>

      {/* Comandos */}
      <div className="p-4 bg-slate-50 rounded-xl">
        <div className="text-slate-500 mb-2">Comandos</div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onClickStartStop("START")}
            disabled={commandBlocked || busy !== null}
            className="px-3 py-1.5 rounded-xl bg-slate-900 text-white disabled:bg-slate-200 disabled:text-slate-400"
          >
            START
          </button>
          <button
            type="button"
            onClick={() => onClickStartStop("STOP")}
            disabled={commandBlocked || busy !== null}
            className="px-3 py-1.5 rounded-xl bg-slate-200 disabled:opacity-50"
          >
            STOP
          </button>
        </div>

        {/* Panel de contraseña (se despliega al tocar START/STOP). Usamos <div>, no <form>, para evitar submits del padre. */}
        {pendingCmd && (
          <div className="mt-3 flex flex-col sm:flex-row items-start sm:items-center gap-2" onClick={stopBubble}>
            <span className="text-xs text-slate-600 sm:mr-1">
              Confirmar <b>{pendingCmd}</b> — Ingrese contraseña:
            </span>
            <input
              ref={inputRef}
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSubmitPassword();
                }
              }}
              onBlur={() => {
                if (pendingCmd && !closingRef.current) {
                  requestAnimationFrame(() => inputRef.current?.focus());
                }
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              placeholder="••••"
              autoComplete="off"
              inputMode="numeric"
            />
            <button
              type="button"
              onClick={onSubmitPassword}
              disabled={busy !== null || pass.length === 0}
              className="px-3 py-2 rounded-lg bg-slate-900 text-white disabled:bg-slate-200 disabled:text-slate-400"
            >
              Enviar
            </button>
            <button
              type="button"
              onClick={() => {
                closingRef.current = true;
                setPendingCmd(null);
                setPass("");
                setTimeout(() => (closingRef.current = false), 150);
              }}
              className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-white"
            >
              Cancelar
            </button>
          </div>
        )}

        {/* Slider VFD opcional (no lo pediste sacar) */}
        {driveType === "vfd" && (
          <div className="mt-4 flex items-center gap-3">
            <div className="grow">
              <input
                type="range"
                min={vfdMin}
                max={vfdMax}
                step={1}
                value={speed}
                onChange={(e) =>
                  setSpeed(clampInt(Number((e.target as HTMLInputElement).value), vfdMin, vfdMax))
                }
                disabled={commandBlocked || busy !== null}
                className="w-full"
              />
              <div className="text-xs text-slate-500 mt-1">
                Setpoint: <span className="font-medium text-slate-700">{speed}%</span> (min {vfdMin} · max {vfdMax})
              </div>
            </div>
            <button
              type="button"
              onClick={() => executeCmd("SPEED")}
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
