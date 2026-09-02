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
  // The lightest point each dark surface reaches AT REST — the worst case for
  // the white text sitting on it. These are DERIVED, not eyeballed: run
  //   node scripts/gradient-hotspot.js
  // which composites the real gradient stacks at several real card widths and
  // prints the hot spot for each. Re-derive them whenever a .*-dark background
  // changes, or this probe keeps scoring text against a ground the app no
  // longer paints and hands back a pass that is not real.
  // SELECTORS, not class names, because the card is now matched by a pair
  // (`.bg-white` plus a large radius) rather than by a class of its own. First
  // match up the ancestor chain wins, so order matters: the most specific
  // surface has to come before the container it sits in.
  const GROUND = [
    ['.app-bar', [26, 17, 12]],
    ['.drawer-dark', [24, 16, 12]],
    ['.tab-bar', [26, 17, 12]],
    ['.hero-dark', [136, 35, 3]],
    ['.tile-dark', [79, 43, 23]],
    ['.tile-ember', [128, 36, 3]],
    ['.auth-card', [68, 36, 16]],
    ['.auth-stage', [150, 62, 10]],
    ['.modal-card', [68, 35, 19]],
    // A nested card, or any `--well`, sitting on a card. Lighter than its host,
    // so it must be checked BEFORE the plain card selector below.
    ['.bg-white.rounded-xl .bg-white.rounded-xl, .bg-white.rounded-xl .bg-white.rounded-2xl,' +
     '.bg-white.rounded-2xl .bg-white.rounded-xl, .bg-white.rounded-2xl .bg-white.rounded-2xl,' +
     '.glass .bg-white.rounded-xl, .glass .bg-white.rounded-2xl', [87, 50, 32]],
    ['.bg-white.rounded-xl, .bg-white.rounded-2xl, .bg-white.rounded-3xl,' +
     '.glass, .glass-strong, .glass-card', [74, 35, 15]],
  ]
  // The page itself: the hot spot of the body gradient, which is the worst case
  // for the white text sitting directly on it (section labels, empty states).
  const PAGE_BASE = [87, 34, 8]

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
  // Surfaces painted with a GRADIENT are invisible to this walk: an element
  // whose background is only a background-image reports `backgroundColor:
  // rgba(0, 0, 0, 0)`, so the walk sails straight past it and scores the text
  // against whatever sits behind. That is how the dark auth card's text came
  // to be measured against the STAGE behind the card, which is 2.5x brighter —
  // four failures that were not real, and on a different day the same
  // mechanism hides one that is.
  //
  // A gradient surface must therefore have an entry in GROUND. `ungrounded`
  // collects any that do not, so a newly added gradient panel announces itself
  // instead of quietly skewing every reading inside it.
  const ungrounded = new Set()
  const effBg = (el) => {
    const stack = []; let n = el
    while (n && n !== document.documentElement) {
      for (const [sel, rgb] of GROUND) {
        if (n.matches && n.matches(sel)) return stack.reduceRight((a, f) => over(f, a), rgb)
      }
      const cs = getComputedStyle(n)
      if (cs.backgroundImage && cs.backgroundImage !== 'none') {
        ungrounded.add((n.className || n.tagName).toString().trim().split(/\s+/).slice(0, 3).join('.'))
      }
      const c = px(cs.backgroundColor)
      // body's own background-color is skipped, not just "not returned on". It
      // is an opaque base sitting UNDER the gradient on body::before, so
      // pushing it would paint over the very ground we are trying to measure
      // and hand back rgb(10,6,5) for every element on the page.
      if (c && c[3] > 0 && n !== document.body) {
        stack.push(c)
        if (c[3] === 1) return stack.reduceRight((a, f) => over(f, a), c.slice(0, 3))
      }
      n = n.parentElement
    }
    // `body` carries an opaque background-color, but the gradient that actually
    // lights the page lives on body::before, which no computed style exposes.
    // So the walk must not stop at body's flat colour — it ends here instead.
    return stack.reduceRight((a, f) => over(f, a), PAGE_BASE)
  }

  const out = []
  document.querySelectorAll('p,span,td,th,h1,h2,h3,h4,label,a,button,div,li,option').forEach((el) => {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return
    // Purely decorative text hidden from assistive tech is out of scope for the
    // contrast rule — it conveys nothing, so there is nothing to fail to read.
    if (el.closest('[aria-hidden="true"]')) return
    // WCAG 1.4.3 exempts inactive controls from the contrast minimum, so a
    // disabled button is not a failure. Skipping it is not a loophole: the
    // whole point of the greyed-out treatment is to read as unavailable. It
    // still has to be LEGIBLE, which is a judgement the probe cannot make.
    if (el.closest('button:disabled, button[disabled], [aria-disabled="true"], fieldset:disabled')) return
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
  return JSON.stringify({ url: location.pathname, failures: out.length, out, gradientSurfacesNotInGROUND: [...ungrounded] }, null, 1)
})()
