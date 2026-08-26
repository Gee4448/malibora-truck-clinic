import { useCallback } from 'react'

// Drives the `.spotlight` radial highlight: feeds the pointer position into the
// element's --mx/--my CSS vars. Returns an onMouseMove handler to spread onto a
// `.spotlight` element. Touch devices never fire mousemove, so this is pure
// desktop polish and costs nothing on phones.
export function useSpotlight() {
  return useCallback((e) => {
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - r.left}px`)
    el.style.setProperty('--my', `${e.clientY - r.top}px`)
  }, [])
}
