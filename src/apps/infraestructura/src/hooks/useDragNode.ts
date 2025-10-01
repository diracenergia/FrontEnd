// src/hooks/useDragNode.ts
import { useRef, useCallback } from 'react'

type Opts = {
  id: string
  enabled: boolean
  /** devuelve la posición actual del nodo (por id) */
  getPos: (id: string) => { x: number; y: number } | null
  /** actualiza la posición del nodo (por id) */
  setPos: (id: string, x: number, y: number) => void
  snap?: number
  onChange?: (x: number, y: number) => void
  onEnd?: () => void
  debug?: boolean
}

/** Convierte coords de pantalla a coords del viewBox del SVG */
function clientToSvg(svg: SVGSVGElement, cx: number, cy: number) {
  const rect = svg.getBoundingClientRect()
  const vb = svg.viewBox.baseVal
  const x = ((cx - rect.left) / rect.width) * vb.width + vb.x
  const y = ((cy - rect.top) / rect.height) * vb.height + vb.y
  return { x, y }
}

export default function useDragNode({
  id, enabled, getPos, setPos, snap = 10, onChange, onEnd, debug,
}: Opts) {
  const dragging = useRef(false)
  const grabDx = useRef(0)
  const grabDy = useRef(0)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const raf = useRef<number | null>(null)

  const tick = (fn: () => void) => {
    if (raf.current != null) return
    raf.current = requestAnimationFrame(() => {
      raf.current = null
      fn()
    })
  }

  const handleMove = useCallback((e: PointerEvent) => {
    if (!dragging.current || !svgRef.current) return
    const svg = svgRef.current
    const cur = getPos(id)
    if (!cur) return

    const { x: mx, y: my } = clientToSvg(svg, e.clientX, e.clientY)

    let x = mx + grabDx.current
    let y = my + grabDy.current

    const s = Math.max(1, snap)
    x = Math.round(x / s) * s
    y = Math.round(y / s) * s

    const vb = svg.viewBox.baseVal
    // límites del viewBox, con pequeño margen
    x = Math.max(vb.x + 10, Math.min(vb.x + vb.width - 10, x))
    y = Math.max(vb.y + 10, Math.min(vb.y + vb.height - 10, y))

    setPos(id, x, y)

    if (debug) console.debug('[drag] move', id, '→', x, y)
    if (onChange) tick(() => onChange(x, y))
  }, [id, snap, onChange, debug, getPos, setPos])

  const handleUp = useCallback((e: PointerEvent) => {
    if (!dragging.current) return
    dragging.current = false
    if (debug) console.debug('[drag] up', id)
    window.removeEventListener('pointermove', handleMove, { passive: true } as any)
    window.removeEventListener('pointerup', handleUp, { passive: true } as any)
    onEnd?.()
  }, [id, handleMove, onEnd, debug])

  const onPointerDown = useCallback((e: React.PointerEvent<SVGElement>) => {
    if (!enabled) return
    const svg = (e.currentTarget.ownerSVGElement || (e.currentTarget as any)) as SVGSVGElement | null
    if (!svg) return
    svgRef.current = svg

    const { x: sx, y: sy } = clientToSvg(svg, e.clientX, e.clientY)
    const cur = getPos(id) || { x: 0, y: 0 }
    grabDx.current = cur.x - sx
    grabDy.current = cur.y - sy

    dragging.current = true
    if (debug) console.debug('[drag] down', id, 'client=', e.clientX, e.clientY)

    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    window.addEventListener('pointermove', handleMove, { passive: true } as any)
    window.addEventListener('pointerup', handleUp, { passive: true } as any)
    e.preventDefault()
  }, [enabled, id, handleMove, handleUp, debug, getPos])

  const onPointerMove = useCallback((e: React.PointerEvent<SVGElement>) => {
    if (!dragging.current) return
    handleMove(e.nativeEvent)
  }, [handleMove])

  const onPointerUp = useCallback((e: React.PointerEvent<SVGElement>) => {
    handleUp(e.nativeEvent)
  }, [handleUp])

  return { onPointerDown, onPointerMove, onPointerUp }
}
