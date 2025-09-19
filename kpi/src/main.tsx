import React from 'react'
import { createRoot } from 'react-dom/client'
import KpiWidgetFetch from './KpiWidgetFetch'
import './index.css'

// Base de la API (FastAPI). En dev: http://localhost:8000
const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

// Location por defecto (podés setear VITE_LOCATION_ID en .env)
let locationId = Number(import.meta.env.VITE_LOCATION_ID ?? 1)

// Ventana por defecto: 24h | 7d | 30d (podés setear VITE_KPI_WINDOW en .env)
let windowSel = (import.meta.env.VITE_KPI_WINDOW ?? '7d') as '24h' | '7d' | '30d'

// Permitir overrides por querystring: ?loc=2&win=30d
const qs = new URLSearchParams(window.location.search)
const locQS = qs.get('loc')
if (locQS && !Number.isNaN(Number(locQS))) {
  locationId = Number(locQS)
}
const winQS = qs.get('win')
if (winQS === '24h' || winQS === '7d' || winQS === '30d') {
  windowSel = winQS
}

const root = createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <KpiWidgetFetch
      baseUrl={API_BASE}
      locationId={locationId}
      window={windowSel}
      title="Tablero de KPIs"
    />
  </React.StrictMode>
)
