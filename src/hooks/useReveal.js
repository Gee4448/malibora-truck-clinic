import { useEffect, useRef } from 'react'

// Scroll-reveal: an element (or a `.reveal-group` container) rises + fades in the
// first time it enters the viewport. One shared IntersectionObserver drives every
// reveal on the page — cheaper than one observer per node on a long list — and
// each element is unobserved as soon as it has shown, so there is no ongoing cost.
//
// Respects `prefers-reduced-motion`: reduced users skip the observer and the
// element is marked visible immediately (the CSS also forces it fully visible).

const REDUCED = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

let observer = null

function getObserver() {
  if (observer || typeof IntersectionObserver === 'undefined') return observer
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible')
          observer.unobserve(entry.target)
        }
      }
    },
    // Reveal a touch before the element is fully on-screen so it never pops in
    // right at the fold; `0px 0px -8%` starts it as it approaches the bottom.
    { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
  )
  return observer
}

export function useReveal() {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // No IntersectionObserver (old webview) or reduced motion → show immediately.
    const obs = REDUCED ? null : getObserver()
    if (!obs) {
      el.classList.add('is-visible')
      return
    }

    obs.observe(el)
    return () => obs.unobserve(el)
  }, [])

  return ref
}
