import { Check, X } from 'lucide-react'

// StatusTracker — the Odoo customer-portal stage bar, in Malibora's skin.
//
// A fixed track of stages with everything reached filled in, so the customer can
// see where their vehicle is without decoding a status word. Stage models live in
// `src/lib/clientStages.js`; this component only draws them.
//
//   <StatusTracker steps={steps} current={2} />            full, with labels
//   <StatusTracker steps={steps} current={2} compact />    dots only, for list rows
//   <StatusTracker steps={steps} current={2} tone="dark" /> on a zinc-900 tile
//
// Motion is pure CSS keyframes (see index.css `.track-seg` / `.track-dot`) rather
// than a JS-driven mount flag: a paused rAF — a backgrounded tab, a hidden
// preview pane — would leave a JS-armed bar stuck empty, which reads as "nothing
// has happened on my job". `animation-fill-mode: both` plus the global
// reduced-motion rule means the finished state is always what you land on.

const TONES = {
  light: {
    doneDot: 'bg-blue-600 text-white',
    currentDot: 'bg-blue-600 text-white ring-4 ring-blue-100',
    todoDot: 'bg-gray-200 text-gray-400',
    doneSeg: 'bg-blue-600',
    todoSeg: 'bg-gray-200',
    doneLabel: 'text-gray-500',
    currentLabel: 'text-blue-700 font-semibold',
    todoLabel: 'text-gray-400',
    cancelled: 'bg-gray-100 text-gray-500',
  },
  dark: {
    doneDot: 'bg-blue-500 text-zinc-900',
    currentDot: 'bg-blue-500 text-zinc-900 ring-4 ring-blue-500/20',
    todoDot: 'bg-zinc-700 text-zinc-500',
    doneSeg: 'bg-blue-500',
    todoSeg: 'bg-zinc-700',
    doneLabel: 'text-zinc-400',
    currentLabel: 'text-blue-400 font-semibold',
    todoLabel: 'text-zinc-600',
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

  // A cancelled document has no position on the track — drawing a half-filled
  // bar for it would imply the work is still moving.
  if (cancelled) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.cancelled} ${className}`}>
        <X className="w-3 h-3" />
        {cancelledLabel}
      </div>
    )
  }

  if (!steps.length) return null

  const dotSize = compact ? 'w-4 h-4' : 'w-6 h-6'
  const segTop = compact ? 'top-[7px]' : 'top-[11px]'

  return (
    <div className={`flex items-start ${className}`} role="list" aria-label="Progress">
      {steps.map((step, i) => {
        const done = i < current
        const isCurrent = i === current
        return (
          <div
            key={step.key || i}
            role="listitem"
            aria-current={isCurrent ? 'step' : undefined}
            className="relative flex-1 flex flex-col items-center gap-1 min-w-0"
          >
            {/* Connector back to the previous dot. Spans this box's left half
                plus the previous box's right half, so it meets both centres. */}
            {i > 0 && (
              <span
                aria-hidden="true"
                style={{ '--seg-i': i }}
                className={`track-seg absolute ${segTop} left-[-50%] right-1/2 h-0.5 rounded-full ${done || isCurrent ? c.doneSeg : c.todoSeg}`}
              />
            )}

            <span
              style={{ '--seg-i': i }}
              className={`track-dot relative z-10 ${dotSize} rounded-full flex items-center justify-center flex-shrink-0 ${
                done ? c.doneDot : isCurrent ? c.currentDot : c.todoDot
              }`}
            >
              {done
                ? <Check className={compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} strokeWidth={3} />
                : !compact && <span className="text-[10px] font-bold">{i + 1}</span>}
            </span>

            {!compact && (
              <span className={`text-[10px] text-center leading-tight px-0.5 ${
                isCurrent ? c.currentLabel : done ? c.doneLabel : c.todoLabel
              }`}>
                {step.label}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
