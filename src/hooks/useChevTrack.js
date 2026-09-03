import { useEffect, useRef } from 'react'

/* Keeps a `.chev-track` ribbon usable when it is wider than the screen.
 *
 * Two jobs, both of which only matter on a phone:
 *
 *   - Scroll the active segment into view. Six tabs do not fit 375px, so
 *     without this the ribbon always opens on tab one and a customer sitting on
 *     "Invoices" sees "Home" highlighted off to the left — the nav looks wrong
 *     about where they are.
 *   - Mark which edges are cut, so `.chev-track.is-scrollable` can fade them.
 *     Once scrolled, a half-visible chevron is unavoidable; the fade is what
 *     makes it read as "there is more this way" rather than as a clipped bar.
 *
 * Lands on a segment BOUNDARY rather than centring — centring cuts the previous
 * label mid-word, which reads as breakage. Scrolls the track, never the page.
 * If this never runs the ribbon just sits at segment one, fully legible.
 *
 * StatusTracker.jsx carries its own copy of this logic. It is deliberately not
 * shared yet: that one also handles a cancelled document, and folding the two
 * together is a change to a verified component, not to this one.
 */
export function useChevTrack(activeIndex) {
  const trackRef = useRef(null)

  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    const sync = () => {
      const overflow = track.scrollWidth - track.clientWidth
      track.classList.toggle('is-scrollable', overflow > 0)
      track.classList.toggle('at-start', track.scrollLeft <= 1)
      track.classList.toggle('at-end', track.scrollLeft >= overflow - 1)
    }

    const overflow = track.scrollWidth - track.clientWidth
    if (overflow > 0 && activeIndex >= 0) {
      const seg = track.children[activeIndex]
      if (seg) track.scrollLeft = Math.max(0, Math.min(seg.offsetLeft - 6, overflow))
    }
    sync()

    track.addEventListener('scroll', sync, { passive: true })
    // The ribbon crosses its overflow threshold on rotate and on the lg: jump.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null
    ro?.observe(track)
    return () => {
      track.removeEventListener('scroll', sync)
      ro?.disconnect()
    }
  }, [activeIndex])

  return trackRef
}
