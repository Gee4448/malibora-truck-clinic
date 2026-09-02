// Contrast probe for the glass design system. Not shipped — dev tool only.
//
// Run it against a page in the browser console while `npm run dev` is up:
//
//   eval(await (await fetch('/@fs/' + '<abs repo path>/scripts/contrast-audit.js')).text())
//
// It prints every text element that fails WCAG AA, with the composited ground
// it was measured against. Zero failures is the bar; re-run it after touching
// any of the --glass-* tokens, any .*-dark surface, or the gray/blue ramps,
// because those changes move contrast on surfaces far from the one you edited.
//
// Composites every text element's background up the ancestor chain and scores
// WCAG contrast. Gradient grounds are modelled explicitly: each dark surface is
// given the LIGHTEST colour it reaches (the hot spot of its bloom), because
// that is the worst case for white text sitting on it; the light page is given
// the most orange point of its field, the worst case for dark text.
//

(() => {
  const GROUND = {
    'app-bar': [26, 17, 12],
    'drawer-dark': [24, 16, 12],
    'tab-bar': [26, 17, 12],
    'hero-dark': [131, 73, 34],
    'tile-dark': [105, 60, 30],
    'auth-stage': [150, 62, 10],
  }
  const LIGHT_BASE = [244, 218, 204]

  // Colours are resolved by PAINTING them, not by parsing. Tailwind v4 emits
  // its default palette as oklch(), so a regex over rgb() silently returns null
  // and the walk sails past an opaque button as if it were transparent — which
  // is exactly how a 3.3:1 amber button hid from an earlier version of this
  // probe. Canvas does the colour-space conversion exactly, for any syntax.
  const cv = document.createElement('canvas'); cv.width = cv.height = 1
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  const memo = new Map()
  // Paint the colour twice, once over black and once over white, and solve.
  // Reading a single pass back and dividing out the alpha does not work: the
  // buffer is 8-bit premultiplied, so at alpha 0.1 a white fill rounds to 26
  // and divides back out to 260 — over-bright, and the error compounds through
  // every ancestor in the composite. Two passes give alpha and colour exactly.
  const paint = (s, base) => {
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = base; ctx.fillRect(0, 0, 1, 1)
    ctx.fillStyle = s; ctx.fillRect(0, 0, 1, 1)
    return ctx.getImageData(0, 0, 1, 1).data
  }
  const px = (s) => {
    if (!s || s === 'transparent' || s === 'none') return null
    if (memo.has(s)) return memo.get(s)
    // A colour the canvas cannot parse leaves fillStyle at the sentinel.
    ctx.fillStyle = '#123456'; ctx.fillStyle = s
    if (ctx.fillStyle === '#123456' && !/#123456/i.test(s)) { memo.set(s, null); return null }
    const B = paint(s, '#000'), W = paint(s, '#fff')
    const a = Math.max(0, Math.min(1, 1 - (W[0] - B[0] + W[1] - B[1] + W[2] - B[2]) / 765))
    const v = a < 0.004 ? [0, 0, 0, 0]
      : [B[0] / a, B[1] / a, B[2] / a, a].map((n, i) => (i < 3 ? Math.min(255, n) : n))
    memo.set(s, v); return v
  }
  const over = (fg, bg) => fg.slice(0, 3).map((c, i) => fg[3] * c + (1 - fg[3]) * bg[i])
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
  const L = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])
  const ratio = (a, b) => { const l1 = L(a), l2 = L(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05) }
  const effBg = (el) => {
    const stack = []; let n = el
    while (n && n !== document.documentElement) {
      for (const k in GROUND) {
        if (n.classList && n.classList.contains(k)) return stack.reduceRight((a, f) => over(f, a), GROUND[k])
      }
      const c = px(getComputedStyle(n).backgroundColor)
      if (c && c[3] > 0) {
        stack.push(c)
        if (c[3] === 1 && n !== document.body) return stack.reduceRight((a, f) => over(f, a), c.slice(0, 3))
      }
      n = n.parentElement
    }
    return stack.reduceRight((a, f) => over(f, a), LIGHT_BASE)
  }

  const out = []
  document.querySelectorAll('p,span,td,th,h1,h2,h3,h4,label,a,button,div,li,option').forEach((el) => {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return
    // Purely decorative text hidden from assistive tech is out of scope for the
    // contrast rule — it conveys nothing, so there is nothing to fail to read.
    if (el.closest('[aria-hidden="true"]')) return
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) return
    const fg = px(cs.color); if (!fg) return
    const bg = effBg(el)
    const fgc = fg[3] < 1 ? over(fg, bg) : fg.slice(0, 3)
    const size = parseFloat(cs.fontSize), w = +cs.fontWeight
    const need = size >= 24 || (size >= 18.66 && w >= 700) ? 3 : 4.5
    const got = ratio(fgc, bg)
    if (got < need) out.push({ txt: el.textContent.trim().slice(0, 34), size, w, got: +got.toFixed(2), need, color: cs.color, ground: bg.map(Math.round).join(',') })
  })
  return JSON.stringify({ url: location.pathname, failures: out.length, out }, null, 1)
})()
