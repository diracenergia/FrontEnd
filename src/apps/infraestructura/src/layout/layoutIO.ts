// src/utils/layoutIO.ts
import { byId } from '@/data/graph'

export type NodePos = { id: string; x: number; y: number }

// versión del esquema guardado (cambiá si modificás ids o layout)
const LS_KEY = 'acuaducto-layout-v1'

/** Devuelve un array {id,x,y} con la posición actual de todos los nodos */
export function exportLayout(): NodePos[] {
  return Object.values(byId).map(n => ({ id: n.id, x: n.x, y: n.y }))
}

/** Aplica un array {id,x,y} a los nodos existentes (ignora ids desconocidos) */
export function importLayout(layout: NodePos[]) {
  const map = new Map(layout.map(p => [p.id, p]))
  for (const id in byId) {
    const pos = map.get(id)
    if (pos) {
      byId[id].x = pos.x
      byId[id].y = pos.y
    }
  }
}

/** Guarda el layout actual en localStorage */
export function saveLayoutToStorage() {
  try {
    const json = JSON.stringify(exportLayout())
    localStorage.setItem(LS_KEY, json)
  } catch (e) {
    // silent
  }
}

/** Intenta cargar layout desde localStorage. Devuelve true si cargó ok. */
export function loadLayoutFromStorage(): boolean {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return false
    const arr = JSON.parse(raw) as NodePos[]
    if (!Array.isArray(arr)) return false
    importLayout(arr)
    return true
  } catch {
    return false
  }
}

/** Borra el layout guardado (por si necesitás resetear manualmente) */
export function clearSavedLayout() {
  try { localStorage.removeItem(LS_KEY) } catch {}
}
