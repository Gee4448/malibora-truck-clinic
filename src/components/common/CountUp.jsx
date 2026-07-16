import { useEffect, useRef, useState } from 'react'

// Animated number counter: eases from 0 to `value` on mount / value change.
// Falls back to a static number when the user prefers reduced motion, and
// always lands on the final value even if rAF is throttled (backgrounded
// tabs, some webviews), via a guaranteed fallback timer.
export default function CountUp({ value, duration = 900, className = '' }) {
  const [display, setDisplay] = useState(0)
  const rafRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    const target = Number(value) || 0
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Guarantee the final value regardless of rAF availability.
    timerRef.current = setTimeout(() => setDisplay(target), reduced ? 0 : duration + 50)

    if (!reduced && target !== 0) {
      const start = performance.now()
      const tick = (now) => {
        const t = Math.min((now - start) / duration, 1)
        // ease-out-expo: fast start, gentle landing
        const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
        setDisplay(Math.round(eased * target))
        if (t < 1) rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    return () => {
      cancelAnimationFrame(rafRef.current)
      clearTimeout(timerRef.current)
    }
  }, [value, duration])

  return <span className={className}>{display}</span>
}
