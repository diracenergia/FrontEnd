// scripts/gen-manifest.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const mode = process.argv[2] || (process.env.VERCEL ? 'prod' : 'dev')

// DEV: micro-apps corren en puertos locales (no copiamos nada a /public)
// PROD (Vercel): micro-apps servidas como estáticos del shell bajo subrutas
const DEV = {
  KPI_URL:   'http://127.0.0.1:5174/',
  INFRA_URL: 'http://127.0.0.1:5181/',
}
const PROD = {
  KPI_URL:   '/kpi/',
  INFRA_URL: '/infraestructura/',
}

const { KPI_URL, INFRA_URL } = mode === 'prod' ? PROD : DEV

const manifest = [
  {
    name: 'kpi',
    type: 'iframe',
    url: KPI_URL,
    mount: '#kpi-root',
    route: '/operaciones',
    allow: 'clipboard-read; clipboard-write; fullscreen',
    sandbox: 'allow-scripts allow-forms allow-same-origin'
  },
  {
    name: 'infra',
    type: 'iframe',
    url: INFRA_URL,
    mount: '#infra-root',
    route: '/operaciones',
    allow: 'clipboard-read; clipboard-write; fullscreen',
    sandbox: 'allow-scripts allow-forms allow-same-origin'
  }
]

mkdirSync(resolve('public'), { recursive: true })
writeFileSync(resolve('public/apps.manifest.json'), JSON.stringify(manifest, null, 2))

console.log('[gen-manifest]', { mode, KPI_URL, INFRA_URL })
