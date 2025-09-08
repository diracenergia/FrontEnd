// src/components/scada/pages/SettingsPage.tsx
import React from "react";
import { hasPerm } from "../rbac";
import { api } from "../../../lib/api";
import { LabeledInput } from "../ui";

type Draft = {
  lowCritical: string;
  lowWarning: string;
  highWarning: string;
  highCritical: string;
};
type DraftMap = Record<string, Draft>;

const toDraft = (t: any): Draft => ({
  lowCritical: numToStr(t?.thresholds?.lowCritical),
  lowWarning: numToStr(t?.thresholds?.lowWarning),
  highWarning: numToStr(t?.thresholds?.highWarning),
  highCritical: numToStr(t?.thresholds?.highCritical),
});

function numToStr(n: unknown) {
  return typeof n === "number" && Number.isFinite(n) ? String(n) : "";
}

export function SettingsPage({ plant, setPlant, user }: any) {
  const canEdit = hasPerm(user, "canEditSetpoints");
  const [savingId, setSavingId] = React.useState<string | null>(null);

  // === Drafts locales, fuera de "plant" (no se pisan con los refresh) ===
  const [drafts, setDrafts] = React.useState<DraftMap>({});

  // Inicializa borradores solo si NO existen (no pisa lo que el usuario ya escribió)
  React.useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const t of plant.tanks || []) {
        if (!next[t.id]) next[t.id] = toDraft(t);
      }
      return next;
    });
  }, [plant.tanks]);

  const getDraft = (tId: string): Draft =>
    drafts[tId] ?? { lowCritical: "", lowWarning: "", highWarning: "", highCritical: "" };

  const setDraft = (tId: string, patch: Partial<Draft>) => {
    setDrafts((prev) => ({ ...prev, [tId]: { ...getDraft(tId), ...patch } }));
  };

  const resetDraftFromTank = (t: any) => setDrafts((prev) => ({ ...prev, [t.id]: toDraft(t) }));

  // Validación
  function parseAndValidate(d: Draft):
    | { ok: true; vals: { lowCritical: number; lowWarning: number; highWarning: number; highCritical: number } }
    | { ok: false; msg: string } {
    const n = (s: string) => {
      const v = Number(s);
      return Number.isFinite(v) ? v : NaN;
    };
    const lowCritical = n(d.lowCritical);
    const lowWarning = n(d.lowWarning);
    const highWarning = n(d.highWarning);
    const highCritical = n(d.highCritical);

    const vals = { lowCritical, lowWarning, highWarning, highCritical };

    if (Object.values(vals).some((v) => !Number.isFinite(v))) {
      return { ok: false, msg: "Todos los valores deben ser numéricos." };
    }
    if (Object.values(vals).some((v) => v < 0 || v > 100)) {
      return { ok: false, msg: "Todos los valores deben estar entre 0 y 100." };
    }
    if (!(lowCritical <= lowWarning && lowWarning < highWarning && highWarning <= highCritical)) {
      return { ok: false, msg: "El orden debe ser: LOW_LOW ≤ LOW < HIGH ≤ HIGH_HIGH." };
    }
    return { ok: true, vals };
  }

  // Guardar un tanque
  async function saveOne(t: any) {
    if (!canEdit) return;
    const d = getDraft(t.id);
    const parsed = parseAndValidate(d);
    if (!parsed.ok) {
      alert(parsed.msg);
      return;
    }

    try {
      setSavingId(t.id);
      const tankId = t.tankId ?? Number(String(t.id).replace(/^TK-/, ""));
      if (!Number.isFinite(tankId)) throw new Error("tankId inválido");

      // Guardar
      await api.saveTankConfig(tankId, {
        low_low_pct: parsed.vals.lowCritical,
        low_pct: parsed.vals.lowWarning,
        high_pct: parsed.vals.highWarning,
        high_high_pct: parsed.vals.highCritical,
      });

      // Refrescar config y aplicar al estado global (sin tocar los drafts del resto)
      const cfg = await api.listTanksWithConfig();
      const row = cfg.find((r: any) => r.id === tankId);
      if (row) {
        const fresh = {
          lowCritical: row.low_low_pct ?? 0,
          lowWarning: row.low_pct ?? 0,
          highWarning: row.high_pct ?? 100,
          highCritical: row.high_high_pct ?? 100,
        };

        setPlant((prev: any) => ({
          ...prev,
          tanks: prev.tanks.map((tk: any) =>
            (tk.tankId ?? Number(String(tk.id).replace(/^TK-/, ""))) === tankId
              ? { ...tk, thresholds: fresh }
              : tk
          ),
        }));

        // Sincronizar borrador con lo guardado (deja de estar "dirty")
        setDrafts((prev) => ({
          ...prev,
          [t.id]: {
            lowCritical: String(fresh.lowCritical),
            lowWarning: String(fresh.lowWarning),
            highWarning: String(fresh.highWarning),
            highCritical: String(fresh.highCritical),
          },
        }));
      }

      alert("Configuración guardada ✅");
    } catch (e: any) {
      alert(e?.message || "Error al guardar");
    } finally {
      setSavingId(null);
    }
  }

  // Detecta si el borrador difiere de thresholds (para marcar cambios)
  const isDirty = (t: any) => {
    const d = getDraft(t.id);
    const th = t?.thresholds ?? {};
    return (
      d.lowCritical !== numToStr(th.lowCritical) ||
      d.lowWarning !== numToStr(th.lowWarning) ||
      d.highWarning !== numToStr(th.highWarning) ||
      d.highCritical !== numToStr(th.highCritical)
    );
  };

  return (
    <div className="space-y-6">
      <div className="text-sm text-slate-600">
        Parámetros de control por equipo (requiere permisos)
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {(plant.tanks || []).map((t: any) => {
          const d = getDraft(t.id);
          const dirty = isDirty(t);

          return (
            <div key={t.id} className="p-4 bg-white border border-slate-200 rounded-2xl">
              <div className="flex items-center justify-between mb-3">
                <div className="font-medium">{t.name}</div>
                {dirty && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                    Cambios sin guardar
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <LabeledInput
                  label="LOW %"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={d.lowWarning}
                  onChange={(v: any) => setDraft(t.id, { lowWarning: String(v) })}
                  disabled={!canEdit}
                />
                <LabeledInput
                  label="HIGH %"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={d.highWarning}
                  onChange={(v: any) => setDraft(t.id, { highWarning: String(v) })}
                  disabled={!canEdit}
                />
                <LabeledInput
                  label="LOW_LOW %"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={d.lowCritical}
                  onChange={(v: any) => setDraft(t.id, { lowCritical: String(v) })}
                  disabled={!canEdit}
                />
                <LabeledInput
                  label="HIGH_HIGH %"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={d.highCritical}
                  onChange={(v: any) => setDraft(t.id, { highCritical: String(v) })}
                  disabled={!canEdit}
                />
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => saveOne(t)}
                  disabled={savingId === t.id || !canEdit || !dirty}
                  className={`px-3 py-1.5 rounded-lg text-sm ${
                    savingId === t.id
                      ? "bg-slate-300 text-slate-600 cursor-not-allowed"
                      : dirty && canEdit
                      ? "bg-slate-900 text-white"
                      : "bg-slate-200 text-slate-500 cursor-not-allowed"
                  }`}
                >
                  {savingId === t.id ? "Guardando…" : "Guardar"}
                </button>

                <button
                  onClick={() => resetDraftFromTank(t)}
                  disabled={savingId === t.id}
                  className="px-3 py-1.5 rounded-lg bg-slate-200 text-slate-800 text-sm"
                >
                  Reset
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
