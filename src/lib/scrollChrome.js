// The arithmetic behind the scroll-reactive chrome, kept apart from the DOM so
// it can be tested without a browser. `useScrollChrome` is the only caller; it
// supplies the three numbers and writes the result onto <html>.
//
// Import-free on purpose, like src/lib/billing.js — a harness that has to boot
// React to check whether a progress bar can exceed 1 is a harness nobody runs.

// How far the page must move before the bar is treated as scrolled. Small
// enough to feel immediate, large enough that the rubber-band overscroll on iOS
// and a one-pixel jitter on a trackpad do not flip the bar back and forth.
export const SCROLL_THRESHOLD = 8

export function scrollChromeState(y, scrollHeight, innerHeight) {
  // Everything below the fold. Zero or negative on a page that does not scroll,
  // which is what keeps the progress line off a short screen entirely rather
  // than showing a bar that can never fill.
  const span = scrollHeight - innerHeight

  // Clamped both ends. Overscroll reports a negative y at the top and a y past
  // the span at the bottom on iOS, and an unclamped ratio would draw a progress
  // line wider than the header or flip it to a negative width.
  const progress = span > 0 ? Math.min(1, Math.max(0, y / span)) : 0

  return {
    scrolled: y > SCROLL_THRESHOLD,
    progress,
    // Raw offset for the hero parallax, floored at 0. Overscrolling upward
    // reports a negative y, and letting that through drives the drift the wrong
    // way — the truck would rise out of the top of the card exactly when the
    // reader pulls the page down to look at it.
    offset: Math.max(0, y),
  }
}
