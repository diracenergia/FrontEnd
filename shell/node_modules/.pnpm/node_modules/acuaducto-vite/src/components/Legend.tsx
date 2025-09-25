import React from 'react'

export default function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs bg-emerald-100 text-emerald-700">
        <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" /> Normal
      </span>
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs bg-amber-100 text-amber-800">
        <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" /> Alerta
      </span>
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs bg-rose-100 text-rose-700">
        <span className="h-2 w-2 rounded-full bg-rose-600 inline-block" /> Severo
      </span>
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs bg-sky-100 text-sky-700">
        <span className="h-2 w-2 rounded-full bg-sky-600 inline-block" /> Flujo
      </span>

    </div>
  )
}
