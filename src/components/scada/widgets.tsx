// src/components/scada/widgets.tsx
import React from "react";
import { Badge } from "./ui";
import { fmtLiters, sevMeta, severityOf } from "./utils";

export type ConnStatus = { online: boolean; ageSec: number; tone: "ok" | "warn" | "bad" };

/* --------------------------
   Fallback de conexión (WS/lecturas)
--------------------------- */
// Umbrales: primero específicos de WS; si no existen, usan staleness general
const WARN_SEC =
  Number((import.meta as any).env?.VITE_WS_WARN_SEC ?? (import.meta as any).env?.VITE_STALE_WARN_SEC ?? 120);
const CRIT_SEC =
  Number((import.meta as any).env?.VITE_WS_CRIT_SEC ?? (import.meta as any).env?.VITE_STALE_CRIT_SEC ?? 300);

function secSince(ts?: string | null) {
  if (!ts) return Number.POSITIVE_INFINITY;
  const t = new Date(ts).getTime();
  if (!isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.round((Date.now() - t) / 1000));
}

/* =====================
   TankCard
===================== */

/**
 * TankCard (versión compacta 3D)
 * - Mantiene el mismo diseño visual
 * - NUEVO: prop `status`: { online, ageSec, tone }
 * - Si no viene `status`, se deriva de `tank.latest.ts` (igual que Faceplate)
 * - `signal`: "ok" | "warn" | "bad" (fallback visual adicional)
 */
export function TankCard({
  tank,
  onClick,
  signal = "ok",
  status,
}: {
  tank: any;
  onClick?: () => void;
  signal?: "ok" | "warn" | "bad";
  status?: ConnStatus;
}) {
  const sev = severityOf(tank.levelPct, tank.thresholds);
  const meta = sevMeta(sev);

  // valores seguros
  const level =
    typeof tank.levelPct === "number" && isFinite(tank.levelPct) ? tank.levelPct : null;
  const capacity =
    typeof tank.capacityL === "number" && isFinite(tank.capacityL) ? tank.capacityL : null;

  // volumen mostrado: usa el de la API si existe; si no, lo calcula
  const volume =
    typeof tank.volumeL === "number" && isFinite(tank.volumeL)
      ? tank.volumeL
      : level != null && capacity != null
      ? Math.round((capacity * level) / 100)
      : null;

  const pct = clampPct(level ?? 0);

  // ---- Conexión: WS o fallback por timestamp de última lectura ----
  const fallbackAge = secSince(tank?.latest?.ts);
  const fallbackTone: ConnStatus["tone"] =
    fallbackAge < WARN_SEC ? "ok" : fallbackAge < CRIT_SEC ? "warn" : "bad";
  const conn: ConnStatus = status ?? { online: fallbackAge < CRIT_SEC, ageSec: fallbackAge, tone: fallbackTone };

  // Dim por señal + status
  const tone = conn.tone ?? signal;
  const dimClass =
    tone === "bad"
      ? "filter grayscale opacity-60"
      : tone === "warn"
      ? "filter saturate-50 opacity-90"
      : "";

  return (
    <button
      onClick={onClick}
      className={`text-left p-4 bg-white border border-slate-200 rounded-2xl hover:shadow-lg transition w-full ${dimClass}`}
      aria-label={`Tanque ${tank.name}, nivel ${Math.round(pct)}% · ${fmtLiters(volume)} / ${fmtLiters(capacity)}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="font-medium text-slate-800">{tank.name}</div>
        <div className="flex items-center gap-2">
          {/* Pastilla de conexión (siempre, con WS o fallback) */}
          <Badge tone={conn.tone}>
            {conn.online
              ? `Online${Number.isFinite(conn.ageSec) ? ` · ${fmtAgoShort(conn.ageSec)}` : ""}`
              : "Offline"}
          </Badge>
          {/* Severidad por nivel */}
          <Badge tone={meta.tone}>{meta.label}</Badge>
        </div>
      </div>

      <div className="flex items-end gap-5">
        {/* === Tanque 3D compacto === */}
        <div className="relative">
          <div className="relative w-[95px] h-44 border-[6px] border-slate-200 rounded-[28px] bg-slate-50 overflow-hidden shadow-inner">
            {/* Material 3D */}
            <div className="pointer-events-none absolute inset-0 rounded-[28px]">
              <div className="absolute inset-0 rounded-[28px] [background:radial-gradient(ellipse_at_center,rgba(255,255,255,0.7)_0%,rgba(255,255,255,0.28)_38%,rgba(0,0,0,0.08)_85%)]" />
              <div className="absolute inset-0 rounded-[28px] [box-shadow:inset_0_18px_28px_rgba(0,0,0,0.10),inset_0_-12px_18px_rgba(0,0,0,0.08)]" />
              <div className="absolute inset-y-2 left-[45%] w-[10%] bg-white/35 blur-sm rounded-full" />
            </div>

            {/* Contenido líquido */}
            <div
              className="absolute bottom-0 left-0 right-0 will-change-[height]"
              style={{ height: `${pct}%`, transition: "height 800ms cubic-bezier(0.2,0.8,0.2,1)" }}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-cyan-700 via-cyan-500 to-cyan-300" />
              <div className="absolute -top-3 left-0 w-[220%] h-6 animate-wave [--wave-speed:7s] text-white/70">
                <WaveSVG />
              </div>
              <div className="absolute -top-2 left-0 w-[220%] h-5 animate-wave [--wave-speed:5s] [animation-direction:reverse] text-white/50">
                <WaveSVG />
              </div>
              <div className="absolute -top-0.5 left-0 right-0 h-2 bg-white/60 rounded-full blur-[1px]" />
              <Bubbles count={16} />
            </div>
          </div>
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-[70px] h-3 bg-black/15 rounded-full blur-md" />
        </div>

        {/* Lecturas a la derecha */}
        <div className="flex-1 min-w-0">
          <div className="text-3xl font-semibold tabular-nums leading-none text-slate-800">
            {Math.round(pct)}%
          </div>
          <div className="text-xs text-slate-500 truncate">
            {fmtLiters(volume)} / {fmtLiters(capacity)}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes waveMove { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .animate-wave { animation: waveMove var(--wave-speed,8s) linear infinite; }
        @keyframes bubble-rise {
          0% { transform: translateY(0) scale(0.7); opacity: 0; }
          10% { opacity: 0.6; }
          100% { transform: translateY(-115%) scale(1); opacity: 0; }
        }
      `}</style>
    </button>
  );
}

/* =====================
   PumpCard
===================== */

const safeDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("es-AR", { hour12: false }) : "—";
const safeNum = (n: unknown) =>
  typeof n === "number" && isFinite(n) ? n.toLocaleString("es-AR") : "—";

export function PumpCard({
  pump,
  onClick,
  signal = "ok",
  status,
}: {
  pump: any;
  onClick?: () => void;
  signal?: "ok" | "warn" | "bad";
  status?: ConnStatus;
}) {
  const l = pump.latest;
  const isOn = !!l?.is_on;

  // ---- Conexión: WS o fallback por timestamp de última lectura ----
  const fallbackAge = secSince(l?.ts);
  const fallbackTone: ConnStatus["tone"] =
    fallbackAge < WARN_SEC ? "ok" : fallbackAge < CRIT_SEC ? "warn" : "bad";
  const conn: ConnStatus = status ?? { online: fallbackAge < CRIT_SEC, ageSec: fallbackAge, tone: fallbackTone };

  // combinar señal con status
  const tone = conn.tone ?? signal;
  const dimClass =
    tone === "bad"
      ? "filter grayscale opacity-60"
      : tone === "warn"
      ? "filter saturate-50 opacity-90"
      : "";

  const flowPct =
    typeof l?.flow_lpm === "number" && typeof pump?.maxFlowLpm === "number" && pump.maxFlowLpm > 0
      ? Math.max(0, Math.min(100, (l.flow_lpm / pump.maxFlowLpm) * 100))
      : null;

  const maxPressure = typeof pump?.maxPressureBar === "number" ? pump.maxPressureBar : null;
  const pressurePct =
    typeof l?.pressure_bar === "number" && typeof maxPressure === "number" && maxPressure > 0
      ? Math.max(0, Math.min(100, (l.pressure_bar / maxPressure) * 100))
      : null;

  return (
    <button
      onClick={onClick}
      className={`border rounded-2xl p-4 text-left w-full bg-white hover:shadow-lg transition ${dimClass}`}
      aria-label={`Bomba ${pump.name}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium text-slate-800">{pump.name}</div>
          <div className="text-xs text-slate-500">
            Modelo: {pump.model ?? "—"} · Máx: {safeNum(pump.maxFlowLpm)} L/min
          </div>
        </div>

        {/* Conexión + ON/OFF */}
        <div className="flex items-center gap-2">
          <Badge tone={conn.tone}>
            {conn.online
              ? `Online${Number.isFinite(conn.ageSec) ? ` · ${fmtAgoShort(conn.ageSec)}` : ""}`
              : "Offline"}
          </Badge>
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${isOn ? "bg-emerald-500" : "bg-slate-300"}`}>
            {isOn && <span className="absolute inset-0 rounded-full animate-pulse-ring" />}
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full border ${
              isOn ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-600 border-slate-200"
            }`}
          >
            {isOn ? "ON" : "OFF"}
          </span>
        </div>
      </div>

      {l ? (
        <div className="mt-3 grid grid-cols-2 gap-4">
          <MetricTile label="Caudal" value={`${safeNum(l.flow_lpm)} L/min`}>
            {flowPct !== null && <Bar pct={flowPct} ariaLabel="Caudal relativo" />}
          </MetricTile>

          <MetricTile label="Presión" value={`${safeNum(l.pressure_bar)} bar`}>
            {pressurePct !== null && <Bar pct={pressurePct} ariaLabel="Presión relativa" />}
          </MetricTile>

          <MetricTile label="Voltaje" value={safeNum(l.voltage_v)} suffix="V" />
          <MetricTile label="Corriente" value={safeNum(l.current_a)} suffix="A" />

          <div className="col-span-2 flex items-center justify-between rounded-xl border bg-slate-50/60 p-3">
            <div className="text-xs text-slate-500">Última lectura</div>
            <div className="text-xs text-slate-600">{safeDate(l.ts)}</div>
            <div className="ml-3 w-8 h-8 text-slate-400">
              <Impeller spinning={isOn} />
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3 text-slate-400 text-sm">Sin lecturas</div>
      )}

      <style>
        {`
        @keyframes rotate360 { to { transform: rotate(360deg); } }
        .impeller-spin { animation: rotate360 1.2s linear infinite; }

        @keyframes pulseRing {
          0% { box-shadow: 0 0 0 0 rgba(16,185,129,0.45); }
          70% { box-shadow: 0 0 0 8px rgba(16,185,129,0); }
          100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
        }
        .animate-pulse-ring { animation: pulseRing 1.6s ease-out infinite; }
      `}
      </style>
    </button>
  );
}

/* =====================
   Compartidos
===================== */

function clampPct(n: number) {
  if (!isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function fmtAgoShort(sec: number) {
  if (!isFinite(sec)) return "—";
  if (sec < 90) return `${sec | 0}s`;
  const m = Math.round(sec / 60);
  if (m < 90) return `${m}m`;
  const h = Math.round(sec / 3600);
  return `${h}h`;
}

function MetricTile({ label, value, suffix, children }: any) {
  return (
    <div className="rounded-xl border p-3 bg-slate-50/60">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-800 tabular-nums">
        {value}
        {suffix ? <span className="ml-1 text-slate-500 text-sm">{suffix}</span> : null}
      </div>
      {children}
    </div>
  );
}

function Bar({ pct, ariaLabel }: { pct: number; ariaLabel?: string }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="mt-2" aria-label={ariaLabel}>
      <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-sky-500"
          style={{ width: `${p}%`, transition: "width 600ms ease" }}
        />
      </div>
      <div className="mt-1 text-[10px] text-slate-500">{Math.round(p)}%</div>
    </div>
  );
}

function Impeller({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className={spinning ? "impeller-spin" : undefined}>
      <g fill="currentColor">
        <circle cx="32" cy="32" r="6" />
        <path d="M32 6a6 6 0 0 1 6 6c0 7-3 12-6 12s-6-5-6-12a6 6 0 0 1 6-6Z" />
        <path d="M58 32a6 6 0 0 1-6 6c-7 0-12-3-12-6s5-6 12-6a6 6 0 0 1 6 6Z" />
        <path d="M32 58a6 6 0 0 1-6-6c0-7 3-12 6-12s6 5 6 12a6 6 0 0 1-6 6Z" />
        <path d="M6 32a6 6 0 0 1 6-6c7 0 12 3 12 6s-5 6-12 6a6 6 0 0 1-6-6Z" />
      </g>
    </svg>
  );
}

// === Extras del Tank ===
function Bubbles({ count = 12 }: { count?: number }) {
  const items = Array.from({ length: count }).map((_, i) => {
    const left = ((i * 73) % 100) + Math.random() * 2 - 1;
    const size = 4 + (i % 6);
    const dur = 3.8 + ((i * 0.37) % 2.8);
    const delay = (i * 0.45) % 6;
    return { i, left, size, dur, delay };
  });

  return (
    <>
      {items.map(({ i, left, size, dur, delay }) => (
        <span
          key={i}
          className="absolute bottom-0 rounded-full bg-white/60 border border-white/30 shadow-sm"
          style={{
            left: `${left}%`,
            width: size,
            height: size,
            animation: `bubble-rise ${dur}s ease-in infinite`,
            animationDelay: `${delay}s`,
          }}
        />
      ))}
    </>
  );
}

function WaveSVG() {
  return (
    <svg viewBox="0 0 120 12" preserveAspectRatio="none" className="w-full h-full">
      <path d="M0 6 Q 10 0 20 6 T 40 6 T 60 6 T 80 6 T 100 6 T 120 6 V 12 H 0 Z" fill="currentColor" />
    </svg>
  );
}
