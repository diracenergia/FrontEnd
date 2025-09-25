// src/components/diagram/nodes.tsx
// -------------------------------------------------------------
// Componentes de nodos para el diagrama (tanques, bombas, válvulas, etc.)
// - GroupBox: caja decorativa para agrupar elementos
// - AutoGroupBox: calcula bounding box de un grupo de ids y dibuja GroupBox
// - Tank: tanque con nivel y color por umbrales (o provisto por backend)
// - Pump: bomba con aro de estado y animación en ON
// - Valve: válvula simple con estado
// - Manifold: colectora simple
// -------------------------------------------------------------

import React from "react";
import type { NodeBase } from "@/types/graph";

/* -------------------------------------------------------------
 * Utilidades pequeñas
 * ----------------------------------------------------------- */
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function levelToFrac(level?: number) {
  if (typeof level !== "number" || !Number.isFinite(level)) return 0;
  return level > 1 ? clamp01(level / 100) : clamp01(level);
}

function fmtCap(v?: number | null) {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(v);
}

/* Indicador de presencia (ok/warn/bad) */
function PresenceDot({ x, y, tone }: { x: number; y: number; tone?: string }) {
  const fill =
    tone === "ok" ? "#10b981" : tone === "warn" ? "#f59e0b" : tone === "bad" ? "#ef4444" : "#94a3b8";
  return (
    <g>
      <circle cx={x} cy={y} r={6} fill="white" />
      <circle cx={x} cy={y} r={5} fill={fill} />
    </g>
  );
}

/* =============================================================
 * 1) GroupBox — Caja decorativa estática
 * =========================================================== */
export function GroupBox({
  x,
  y,
  w,
  h,
  label,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}) {
  return (
    <g className="loc-group" pointerEvents="none">
      <rect x={x} y={y} width={w} height={h} rx={14} className="fill-slate-50 stroke-slate-200" />
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={14}
        fill="none"
        className="stroke-slate-300"
        strokeDasharray="6 6"
      />
      <text x={x + 12} y={y + 20} className="fill-slate-500 text-[12px]">
        {label}
      </text>
    </g>
  );
}

/* =============================================================
 * 2) AutoGroupBox — Calcula caja que engloba ids
 * =========================================================== */
export function AutoGroupBox({
  ids,
  label,
  byId,
  pad = 28,
  grow = { left: 0, right: 0, top: 0, bottom: 0 },
}: {
  ids: string[];
  label: string;
  byId: Record<string, NodeBase>;
  pad?: number;
  grow?: { left?: number; right?: number; top?: number; bottom?: number };
}) {
  const pts = ids.map((id) => byId[id]).filter(Boolean) as NodeBase[];
  if (!pts.length) return null;

  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);

  const minX = Math.min(...xs) - pad - (grow.left ?? 0);
  const maxX = Math.max(...xs) + pad + (grow.right ?? 0);
  const minY = Math.min(...ys) - pad - (grow.top ?? 0);
  const maxY = Math.max(...ys) + pad + (grow.bottom ?? 0);

  const w = maxX - minX;
  const h = maxY - minY;

  return <GroupBox x={minX} y={minY} w={w} h={h} label={label} />;
}

/* =============================================================
 /* 
 * 3) Tank — Tanque con nivel y color por umbrales
 *    - Si backend envía tank_color_hex / tank_status se respeta.
 *    - Si no, se calcula con low/low_low/high/high_high.
 * =========================================================== */

/* 
 * 3) Tank — Tanque con nivel y color por umbrales
 *    - Si backend envía tank_color_hex / tank_status se respeta.
 *    - Si no, se calcula con low/low_low/high/high_high.
 * =========================================================== */

const COLOR_OK = "#10b981";     // emerald-500
const COLOR_WARN = "#f59e0b";   // amber-500
const COLOR_CRIT = "#ef4444";   // rose-500
const COLOR_DISC = "#94a3b8";   // slate-400

function mapTankStatusToColor(status?: NodeBase["tank_status"]) {
  switch (status) {
    case "ok":
      return COLOR_OK;
    case "warn":
    case "warning":
      return COLOR_WARN;
    case "crit":
    case "critical":
      return COLOR_CRIT;
    case "disconnected":
      return COLOR_DISC;
    default:
      return undefined;
  }
}

/** Calcula estado por umbrales si backend no lo provee */
function computeTankToneByThresholds(n: NodeBase, fracLevel: number) {
  const low = Number.isFinite(n.low_pct as number) ? (n.low_pct as number) : 30;
  const lowlow = Number.isFinite(n.low_low_pct as number) ? (n.low_low_pct as number) : 12;
  const high = Number.isFinite(n.high_pct as number) ? (n.high_pct as number) : 70;
  const highhigh = Number.isFinite(n.high_high_pct as number) ? (n.high_high_pct as number) : 90;

  const pct = Math.round(fracLevel * 100);

  if (pct <= lowlow) return { status: "crit" as const, color: COLOR_CRIT };
  if (pct <= low) return { status: "warn" as const, color: COLOR_WARN };
  if (pct >= highhigh) return { status: "crit" as const, color: COLOR_CRIT };
  if (pct >= high) return { status: "warn" as const, color: COLOR_WARN };
  return { status: "ok" as const, color: COLOR_OK };
}

export function Tank({ n }: { n: NodeBase }) {
  const level = levelToFrac(n.level);

  // 1) Si backend mandó color/estado, se respeta; si no, calculamos por umbrales
  const backendColor = n.tank_color_hex || mapTankStatusToColor(n.tank_status);
  const computed = backendColor ? null : computeTankToneByThresholds(n, level);
  const stroke = backendColor || computed?.color || COLOR_DISC;

  const gid = (suffix: string) => `tank-${n.id}-${suffix}`;

  // 🔌 Offline si la conexión NO es "ok"
  // (Si querés solo 'bad'/'disconnected': const offline = n.conn_tone === 'bad' || n.conn_tone === 'disconnected')
  const offline = n.conn_tone && n.conn_tone !== "ok";

  // Estado normalizado para decidir alertas
  const statusRaw = (n.tank_status as string | undefined) || (computed?.status as string | undefined);
  const isWarn = statusRaw === "warn" || statusRaw === "warning";
  const isCrit = statusRaw === "crit" || statusRaw === "critical";

  // Geometría
  const outerW = 132;
  const outerH = 96;
  const outerRX = 16;
  const innerW = 100;
  const innerH = 60;
  const innerRX = 10;

  const outerX = n.x - outerW / 2;
  const outerY = n.y - outerH / 2;
  const innerX = n.x - innerW / 2;
  const innerY = n.y - innerH / 2;

  const levelH = innerH * level;
  const levelY = innerY + (innerH - levelH);

  // Chip de estado: usar el mismo color
  const statusFill = stroke;

  return (
    <g
      // Indicador visual de offline: desaturado + opacidad
      filter={offline ? `url(#${gid("offline-gray")})` : undefined}
      opacity={offline ? 0.55 : 1}
    >
      {/* Sombra */}
      <ellipse cx={n.x} cy={outerY + outerH + 8} rx={outerW * 0.32} ry={8} className="fill-black/5" />

      {/* Defs */}
      <defs>
        {/* Filtro para desaturar cuando está offline */}
        <filter id={gid("offline-gray")}>
          <feColorMatrix type="saturate" values="0" />
        </filter>

        {/* Glow para alerta (warn/crit) */}
        <filter id={gid("glow")} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <linearGradient id={gid("body")} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#f1f5f9" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
        <linearGradient id={gid("stroke")} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={stroke} stopOpacity="1" />
          <stop offset="100%" stopColor={stroke} stopOpacity=".7" />
        </linearGradient>
        <linearGradient id={gid("water")} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
        <linearGradient id={gid("gloss")} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity=".7" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity=".15" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <mask id={gid("inner-mask")}>
          <rect x={innerX} y={innerY} width={innerW} height={innerH} rx={innerRX} ry={innerRX} fill="#fff" />
        </mask>
      </defs>

      {/* HALO de alerta (solo online y en warn/crit) */}
      {!offline && (isWarn || isCrit) && (
        <g opacity={isCrit ? 0.95 : 0.85}>
          <rect
            x={outerX}
            y={outerY}
            width={outerW}
            height={outerH}
            rx={outerRX}
            fill="none"
            stroke={statusFill}
            strokeWidth={isCrit ? 8 : 6}
            filter={`url(#${gid("glow")})`}
          >
            <animate
              attributeName="opacity"
              values={isCrit ? "1;0.6;1" : "0.9;0.5;0.9"}
              dur={isCrit ? "0.9s" : "1.3s"}
              repeatCount="indefinite"
            />
          </rect>
        </g>
      )}

      {/* Cuerpo externo con borde coloreado por estado */}
      <rect
        x={outerX}
        y={outerY}
        width={outerW}
        height={outerH}
        rx={outerRX}
        fill={`url(#${gid("body")})`}
        stroke={`url(#${gid("stroke")})`}
        strokeWidth={(isWarn || isCrit) ? 3.5 : 2}
      />

      {/* Cubeta interna */}
      <rect x={innerX} y={innerY} width={innerW} height={innerH} rx={innerRX} className="stroke-slate-300" fill="#f8fafc" />

      {/* Columna de agua */}
      <g mask={`url(#${gid("inner-mask")})`}>
        <rect x={innerX} y={levelY} width={innerW} height={levelH} fill={`url(#${gid("water")})`} />
        <rect x={innerX} y={levelY - 1} width={innerW} height={2} className="fill-white/60" />
        <rect x={innerX} y={innerY} width={innerW} height={innerH} fill={`url(#${gid("gloss")})`} />
      </g>

      {/* Etiquetas */}
      <text x={n.x} y={outerY - 10} textAnchor="middle" className="fill-slate-800 text-[12px] font-semibold">
        {n.name}
      </text>
      <text x={n.x} y={n.y + 4} textAnchor="middle" className="fill-slate-700 text-[12px] font-semibold">
        {(level * 100).toFixed(0)}%
      </text>
      <text x={n.x} y={outerY + outerH + 24} textAnchor="middle" className="fill-slate-600 text-[11px]">
        Cap. {fmtCap(n.capacity)} m³
      </text>

      {/* Chip estado (si hay) */}
      {(n.tank_status || computed) && (
        <g>
          <rect x={outerX + outerW - 22} y={outerY + 6} width={16} height={8} rx={3} fill={statusFill} />
          <circle cx={outerX + outerW - 14} cy={outerY + 10} r={2} className="fill-white" />
        </g>
      )}
    </g>
  );
}


/* =============================================================
 * 4) Pump — Bomba con aro de estado + animación ON
 * =========================================================== */
/* =============================================================
 * 4) Pump — Bomba con aro de estado + animación ON
 * =========================================================== */
function pumpColors(status: NodeBase["status"]) {
  switch (status) {
    case "on":
      return {
        ring: "stroke-emerald-500",
        glow: "fill-emerald-400/25",
        body: "fill-emerald-50",
        icon: "stroke-emerald-700",
      };
    case "standby":
      return {
        ring: "stroke-amber-500",
        glow: "fill-amber-400/20",
        body: "fill-amber-50",
        icon: "stroke-amber-700",
      };
    case "fault":
      return {
        ring: "stroke-rose-600",
        glow: "fill-rose-500/20",
        body: "fill-rose-50",
        icon: "stroke-rose-700",
      };
    default:
      return {
        ring: "stroke-slate-400",
        glow: "fill-transparent",
        body: "fill-slate-50",
        icon: "stroke-slate-600",
      };
  }
}

export function Pump({ n }: { n: NodeBase }) {
  const s = n.status ?? "unknown";
  const { ring, glow, body, icon } = pumpColors(s);
  const gid = (suffix: string) => `grad-${n.id}-${suffix}`;

  // 🔌 Offline si la conexión NO es "ok"
  // (si querés solo 'bad'/'disconnected': const offline = n.conn_tone === 'bad' || n.conn_tone === 'disconnected')
  const offline = n.conn_tone && n.conn_tone !== "ok";

  return (
    <g
      // Igual que en Tank: desaturado + opacidad cuando está offline
      filter={offline ? `url(#${gid("offline-gray")})` : undefined}
      opacity={offline ? 0.55 : 1}
    >
      {/* Sin puntito de presencia en bombas cuando aplicamos estilo offline */}

      <title>{s === "on" ? "Bomba ENCENDIDA" : "Bomba APAGADA"}</title>

      {/* Glow ON */}
      {s === "on" && <circle cx={n.x} cy={n.y} r={36} className={glow} />}

      {/* Gradiente del cuerpo + filtro gris */}
      <defs>
        {/* Filtro para desaturar cuando está offline */}
        <filter id={gid("offline-gray")}>
          <feColorMatrix type="saturate" values="0" />
        </filter>

        <radialGradient id={gid("pump")} cx="50%" cy="45%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e5e7eb" />
        </radialGradient>
      </defs>

      {/* Sombra */}
      <ellipse cx={n.x} cy={n.y + 24} rx={30} ry={8} className="fill-black/5" />

      {/* Cuerpo */}
      <rect x={n.x - 32} y={n.y - 24} width={64} height={48} rx={12} className="stroke-slate-300" fill={`url(#${gid("pump")})`} />

      {/* Voluta */}
      <circle cx={n.x} cy={n.y} r={22} className={`${body} stroke-slate-300`} />

      {/* Aro estado */}
      <circle cx={n.x} cy={n.y} r={22} className={`${ring}`} strokeWidth={3} fill="none" />

      {/* Rotor */}
      <g className={!offline && s === "on" ? "animate-[spin_2.2s_linear_infinite]" : ""} style={{ transformOrigin: `${n.x}px ${n.y}px` }}>
        <path d={`M ${n.x} ${n.y - 12} l 6 10 a 12 12 0 0 1 -12 0 z`} className={`${icon} fill-white`} strokeWidth={1} />
        <path d={`M ${n.x + 12} ${n.y} l -10 6 a 12 12 0 0 1 0 -12 z`} className={`${icon} fill-white`} strokeWidth={1} />
        <path d={`M ${n.x} ${n.y + 12} l -6 -10 a 12 12 0 0 1 12 0 z`} className={`${icon} fill-white`} strokeWidth={1} />
      </g>

      {/* Conexiones decorativas */}
      <rect x={n.x + 24} y={n.y - 6} width={16} height={12} rx={3} className="fill-white stroke-slate-300" />
      <rect x={n.x - 40} y={n.y - 4} width={14} height={8} rx={2} className="fill-white stroke-slate-300" />

      {/* Indicador mini */}
     

      {/* Etiquetas */}
      <text x={n.x} y={n.y + 40} textAnchor="middle" className="fill-slate-800 text-[12px] font-semibold">
        {n.name}
      </text>
      <text x={n.x} y={n.y + 56} textAnchor="middle" className="fill-slate-600 text-[11px]">
        {Number.isFinite(n.kW as number) ? `${n.kW} kW` : "—"}
      </text>
    </g>
  );
}

/* =============================================================
 * 5) Valve — Válvula con estado
 * =========================================================== */
export function Valve({ n }: { n: NodeBase }) {
  const color =
    n.state === "open" ? "fill-emerald-500" : n.state === "closed" ? "fill-rose-600" : "fill-amber-500";

  return (
    <g>
      <rect x={n.x - 16} y={n.y - 10} width={32} height={20} rx={4} className="fill-white stroke-slate-300" />
      <circle cx={n.x} cy={n.y} r={7} className={`stroke-white ${color}`} />
      <text x={n.x} y={n.y + 26} textAnchor="middle" className="fill-slate-700 text-[11px]">
        {n.name} • {n.state}
      </text>
    </g>
  );
}

/* =============================================================
 * 6) Manifold — Colectora simple
 * =========================================================== */
export function Manifold({ n }: { n: NodeBase }) {
  return (
    <g>
      <rect x={n.x - 50} y={n.y - 8} width={100} height={16} rx={6} className="fill-slate-200 stroke-slate-300" />
      <text x={n.x} y={n.y - 14} textAnchor="middle" className="fill-slate-600 text-[11px]">
        {n.name}
      </text>
    </g>
  );
}
