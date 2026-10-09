import { useRef, useEffect, useState } from 'react'

// A finger/mouse signature box. Calls onChange with a small PNG data URL after
// each stroke, or null once cleared. Kept tiny on purpose: it is stored on the
// payment row itself (migration 044), not in file storage.
export default function SignaturePad({ onChange, clearLabel = 'Clear', hint, height = 110 }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const last = useRef(null)
  const inked = useRef(false)
  const [empty, setEmpty] = useState(true)

  // Size the backing store to the box as laid out, so strokes land under the
  // pointer instead of being stretched.
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const w = c.clientWidth
    c.width = w
    c.height = height
    const ctx = c.getContext('2d')
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111827'
  }, [height])

  const point = (e) => {
    const r = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const down = (e) => {
    e.preventDefault()
    canvasRef.current.setPointerCapture?.(e.pointerId)
    drawing.current = true
    last.current = point(e)
  }

  const move = (e) => {
    if (!drawing.current) return
    e.preventDefault()
    const p = point(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
    if (!inked.current) { inked.current = true; setEmpty(false) }
  }

  const up = () => {
    if (!drawing.current) return
    drawing.current = false
    if (inked.current) onChange?.(canvasRef.current.toDataURL('image/png'))
  }

  const clear = () => {
    const c = canvasRef.current
    c.getContext('2d').clearRect(0, 0, c.width, c.height)
    inked.current = false
    setEmpty(true)
    onChange?.(null)
  }

  return (
    <div>
      <div className="relative">
        {/* White behind the ink in both themes: it is a piece of paper. */}
        <canvas ref={canvasRef}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}
          style={{ height, touchAction: 'none', background: '#ffffff' }}
          className="w-full rounded-lg border border-gray-300 cursor-crosshair" />
        {empty && hint && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-gray-400">{hint}</span>
        )}
      </div>
      {!empty && (
        <button type="button" onClick={clear} className="mt-1 text-xs text-gray-500 hover:text-red-600">{clearLabel}</button>
      )}
    </div>
  )
}
