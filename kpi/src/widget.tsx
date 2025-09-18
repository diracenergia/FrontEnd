import React, { useEffect, useRef } from 'react'
import ReactDOM from 'react-dom/client'
import KpiContent from "@/components/kpi/KpiContent";

import './index.css' 

export type KpiDatum = { label: string; value: number; delta?: number }
export type SeriesDatum = { name: string; data: number[] }

export type KpiWidgetProps = {
  title?: string
  data?: {
    kpis?: KpiDatum[]
    series?: SeriesDatum[]
    categories?: string[]
    [key: string]: any
  }
  compact?: boolean
}

// 1) React component to embed directly
export function KpiWidget(props: KpiWidgetProps) {
  return (
    <div style={{ fontFamily: 'ui-sans-serif, system-ui', width: '100%', height: '100%' }}>
      {props.title && <h2 style={{ margin: 0, marginBottom: 12 }}>{props.title}</h2>}
      <KpiContent {...(props as any)} />
    </div>
  )
}

// 2) Mount helper for host apps (microfrontend style)
export function mountKpiWidget(el: HTMLElement, props: KpiWidgetProps = {}) {
  const root = ReactDOM.createRoot(el)
  root.render(<KpiWidget {...props} />)
  return () => root.unmount()
}

// 3) Define a Web Component for non-React hosts
class KpiWidgetElement extends HTMLElement {
  root?: ReturnType<typeof ReactDOM.createRoot>
  static get observedAttributes() { return ['title', 'compact', 'data'] }
  connectedCallback() {
    this.root = ReactDOM.createRoot(this)
    this.render()
  }
  attributeChangedCallback() { this.render() }
  disconnectedCallback() { this.root?.unmount() }
  render() {
    const title = this.getAttribute('title') || undefined
    const compact = this.getAttribute('compact') === 'true'
    let data: any = undefined
    const dataAttr = this.getAttribute('data')
    if (dataAttr) {
      try { data = JSON.parse(dataAttr) } catch { data = undefined }
    }
    this.root?.render(<KpiWidget title={title} compact={compact} data={data} />)
  }
}

// evitar doble registro (útil en HMR)
if (!customElements.get('kpi-widget')) {
  customElements.define('kpi-widget', KpiWidgetElement)
}
