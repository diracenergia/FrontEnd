// src/debug/kpiDebug.ts
import * as React from 'react'

type Unpatch = () => void

export function logReactEnv(origin = '[KPI]') {
  const g = window as any
  const info: Record<string, any> = {
    origin,
    hostReactVersion: (React as any)?.version,
    windowReactVersion: g.React?.version,
    sameReactObject: g.React ? g.React === React : 'no-window.React',
    hasReactDOMGlobal: !!g.ReactDOM,
    devtools: g.__REACT_DEVTOOLS_GLOBAL_HOOK__ ? 'present' : 'not-present',
  }
  console.log('[ReactEnv]', info)
}

export function logCustomElementsStatus(tags: string[]) {
  const out: any = {}
  for (const t of tags) {
    const ctor = customElements.get(t) as any
    out[t] = ctor
      ? { defined: true, version: ctor?.version ?? ctor?.constructor?.version ?? 'unknown' }
      : { defined: false }
  }
  console.log('[CustomElements]', out)
}

export async function logSWAndCaches() {
  try {
    const regs = await (navigator.serviceWorker?.getRegistrations?.() ?? Promise.resolve([]))
    console.log('[SW]', regs.map(r => ({ scope: r.scope, scriptURL: r.active?.scriptURL ?? null })))
  } catch (e) { console.log('[SW]', 'error', e) }

  if ('caches' in window) {
    try { console.log('[Caches.keys]', await caches.keys()) }
    catch (e) { console.log('[Caches]', 'error', e) }
  }
}

/** Parchea window.ReactDOM.createRoot (si existe) para contar montajes */
export function patchCreateRootForCounting(): Unpatch {
  const g = window as any
  const rdom = g.ReactDOM
  if (!rdom || typeof rdom.createRoot !== 'function') {
    console.warn('[patchCreateRootForCounting] window.ReactDOM.createRoot no disponible; no parcheo')
    return () => {}
  }

  const original = rdom.createRoot.bind(rdom)
  const mounted = new Map<Element, any>()

  function wrappedCreateRoot(container: Element, options?: any) {
    console.log('[createRoot]', container, options)
    const root = original(container, options)

    const originalRender = root.render.bind(root)
    root.render = (el: any) => {
      const typeName = el?.type?.displayName || el?.type?.name || typeof el
      console.log('[root.render]', container, { elementType: typeName })
      return originalRender(el)
    }

    const originalUnmount = root.unmount.bind(root)
    root.unmount = () => {
      console.log('[root.unmount]', container)
      mounted.delete(container)
      return originalUnmount()
    }

    mounted.set(container, root)
    console.log('[createRoot->mountedCount]', mounted.size)
    return root
  }

  g.ReactDOM.createRoot = wrappedCreateRoot
  console.warn('[patchCreateRootForCounting] applied on window.ReactDOM')
  return () => {
    g.ReactDOM.createRoot = original
    console.warn('[patchCreateRootForCounting] reverted')
  }
}
