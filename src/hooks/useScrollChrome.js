import { useEffect } from 'react'
import { scrollChromeState } from '../lib/scrollChrome'

// Publishes the page's scroll state to CSS, so the chrome can react to it
// without any component re-rendering on scroll.
//
// Two things land on <html>:
//   data-scrolled="1"        once the page has moved off the top
//   --scroll-progress: 0..1  how far through the document the reader is
//   --scroll-y               the offset itself, for the hero parallax
//
// Both are read by `.app-bar` in index.css: the bar condenses to 48px and grows
// a progress line along its bottom edge. State goes to the DOM rather than into
// React state on purpose — a scroll handler that calls setState re-renders the
// whole shell on every frame of every scroll, on phones that cannot afford it.
// Writing a custom property costs one style recalc on the root and nothing
// above it.
//
// Reads are batched into a rAF: `scroll` can fire many times per frame, and
// `scrollY`/`scrollHeight` are layout reads, so the throttle is what keeps this
// off the critical path rather than a nicety.
//
// Reduced motion is handled in CSS, not here. The values still update, because
// a progress indicator tracks the reader's own gesture the way a scrollbar
// does; what the media query drops is the height transition.
//
// The maths lives in src/lib/scrollChrome.js so it can be tested without a
// browser.

export function useScrollChrome(routeKey) {
  useEffect(() => {
    const root = document.documentElement
    let frame = 0

    const measure = () => {
      frame = 0
      const { scrolled, progress, offset } = scrollChromeState(
        window.scrollY || root.scrollTop || 0,
        root.scrollHeight,
        window.innerHeight,
      )
      root.dataset.scrolled = scrolled ? '1' : '0'
      root.style.setProperty('--scroll-progress', String(progress))
      // Unitless: `.drift` multiplies it by a per-element px rate, so one
      // number drives every parallax layer at its own depth.
      root.style.setProperty('--scroll-y', String(offset))
    }

    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure) }

    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
    // Re-measured on navigation: the shell does not remount between routes, so
    // without this a short page entered from a long one keeps the previous
    // page's progress and stays condensed with nothing above it.
  }, [routeKey])
}
