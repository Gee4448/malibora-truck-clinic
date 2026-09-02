import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

// StatusTracker — Odoo's statusbar ribbon, in Malibora's colours.
//
// A row of chevron segments pointing along the customer's journey, so they read
// their position off the shape of the thing rather than decoding a status word.
// Stage models live in `src/lib/clientStages.js`; this only draws them.
//
//   <StatusTracker steps={steps} current={2} />             detail page
//   <StatusTracker steps={steps} current={2} compact />     smaller, for list rows
//   <StatusTracker steps={steps} current={2} tone="dark" /> on a zinc-900 tile
//
// Odoo highlights only the CURRENT stage and leaves the rest plain. Here the
// stages already passed are tinted too: a customer wants to see how far the work
// has come, not just where it happens to be standing.
//
// Chevron geometry and the entrance animation are in index.css (`.chev-track` /
// `.chev`) — CSS keyframes on purpose, since a JS-armed ribbon would sit blank
// in a backgrounded tab.

const TONES = {
  light: {
    done: 'bg-blue-100 text-blue-800',
    current: 'bg-blue-600 text-white',
    todo: 'bg-gray-100 text-gray-400',
    cancelled: 'bg-gray-100 text-gray-500',
  },
  dark: {
    done: 'bg-blue-500/25 text-blue-200',
    current: 'bg-blue-500 text-zinc-900',
    todo: 'bg-zinc-800 text-zinc-500',
    cancelled: 'bg-zinc-800 text-zinc-400',
  },
}

export default function StatusTracker({
  steps = [],
  current = 0,
  cancelled = false,
  compact = false,
  tone = 'light',
  cancelledLabel = 'Cancelled',
  className = '',
}) {
  const c = TONES[tone] || TONES.light
  const trackRef = useRef(null)

  // Eight Odoo stages never fitted a desktop either — on a phone this ribbon
  // scrolls. Two things matter when it does:
  //
  //  - The stage the customer is ON must be visible, or a job halfway through
  //    opens showing "Requested" and looks stalled.
  //  - It must land on a segment BOUNDARY. Centring the current segment cuts the
  //    one before it mid-word ("UOTATION"), which reads as a broken layout
  //    rather than as scrollable content. Anchoring the current stage to the
  //    left edge means what scrolls out of view is the past, which is the part
  //    the customer no longer needs.
  //
  // Scrolls the track itself, never the page. If this effect never runs (JS
  // paused in a background tab) the ribbon just sits at stage one, fully legible.
  useEffect(() => {
    const track = trackRef.current
    if (!track || cancelled) return

    // Which edges are cut right now. Once scrolled, a half-visible chevron is
    // unavoidable — the fade tied to these classes is what makes it read as
    // "there is more this way" rather than as a clipped layout.
    const sync = () => {
      const overflow = track.scrollWidth - track.clientWidth
      track.classList.toggle('is-scrollable', overflow > 0)
      track.classList.toggle('at-start', track.scrollLeft <= 1)
      track.classList.toggle('at-end', track.scrollLeft >= overflow - 1)
    }

    const overflow = track.scrollWidth - track.clientWidth
    if (overflow > 0) {
      const seg = track.children[current]
      if (seg) track.scrollLeft = Math.max(0, Math.min(seg.offsetLeft - 6, overflow))
    }
    sync()

    track.addEventListener('scroll', sync, { passive: true })
    return () => track.removeEventListener('scroll', sync)
  }, [current, cancelled, steps.length])

  // A cancelled document has no position on the track — a half-filled ribbon
  // would imply the work is still moving.
  if (cancelled) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.cancelled} ${className}`}>
        <X className="w-3 h-3" />
        {cancelledLabel}
      </div>
    )
  }

  if (!steps.length) return null

  // 9px on a phone is what makes the English track fit 375px without scrolling;
  // the roomier 10px is kept for tablets and up, where there is space for it.
  const size = compact
    ? 'text-[9px] leading-none py-1.5 tracking-wide'
    : 'text-[9px] sm:text-[10px] leading-none py-2 tracking-wide'

  return (
    <div
      ref={trackRef}
      className={`chev-track ${className}`}
      role="list"
      aria-label="Progress"
    >
      {steps.map((step, i) => {
        const done = i < current
        const isCurrent = i === current
        return (
          <div
            key={step.key || i}
            role="listitem"
            aria-current={isCurrent ? 'step' : undefined}
            style={{ '--seg-i': i }}
            className={`chev flex items-center justify-center font-bold uppercase whitespace-nowrap ${size} ${
              isCurrent ? c.current : done ? c.done : c.todo
            }`}
          >
            {step.label}
          </div>
        )
      })}
    </div>
  )
}
