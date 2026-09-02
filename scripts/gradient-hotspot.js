// Derives the worst-case ground colour of a layered CSS gradient surface.
// Not shipped — dev tool. Run: node scripts/gradient-hotspot.js
//
// Why this exists: contrast-audit.js models every dark surface by a single
// hard-coded RGB — the LIGHTEST point the surface reaches, because that is the
// worst case for the white text sitting on it. Those numbers used to be typed
// in by eye. That is fine until someone retunes a bloom, at which point the
// audit keeps happily scoring text against a ground the app no longer paints,
// and reports a pass that is not real.
//
// So the surfaces are declared here as data, sampled on a grid, composited
// source-over, and the brightest sample wins. Change a gradient below to match
// the stylesheet, re-run, and paste the output into contrast-audit.js.
//
// Gradient maths follows the CSS images spec:
//   - an explicit-size radial gradient reaches its ending shape at its stated
//     radii, and distance is normalised elliptically against them;
//   - interpolation towards the keyword `transparent` happens in PREMULTIPLIED
//     space, so the hue does not drift toward black on the way out — which is
//     precisely why these blooms stay orange at their edges instead of muddying.

const PX_PER_REM = 16

const radial = (w, h, atX, atY, color, endPct, alpha) => (x, y, W, H) => {
  const cx = (atX / 100) * W, cy = (atY / 100) * H
  const rx = w * PX_PER_REM, ry = h * PX_PER_REM
  const d = Math.hypot((x - cx) / rx, (y - cy) / ry)
  const end = endPct / 100
  if (d >= end) return [0, 0, 0, 0]
  return [...color, alpha * (1 - d / end)]
}

const linear = (deg, stops) => (x, y, W, H) => {
  const t = (deg * Math.PI) / 180
  const ux = Math.sin(t), uy = -Math.cos(t)
  const L = Math.abs(W * ux) + Math.abs(H * uy)
  const s = (x - W / 2) * ux + (y - H / 2) * uy
  const p = Math.max(0, Math.min(1, (s + L / 2) / L))
  let a = stops[0], b = stops[stops.length - 1]
  for (let i = 0; i < stops.length - 1; i++) {
    if (p >= stops[i].at && p <= stops[i + 1].at) { a = stops[i]; b = stops[i + 1]; break }
  }
  const span = b.at - a.at
  // CSS clamps outside the stop list: before the first stop and after the last
  // one the colour holds flat. Without this clamp the maths extrapolates past
  // the final stop and returns negative channels — which looks like a very
  // dark ground and hands back a contrast pass that is not real.
  const k = span === 0 ? 0 : Math.max(0, Math.min(1, (p - a.at) / span))
  // Premultiplied lerp, so a stop fading to `transparent` keeps its hue.
  const aa = a.a + (b.a - a.a) * k
  const mix = (i) => (aa === 0 ? 0 : (a.c[i] * a.a + (b.c[i] * b.a - a.c[i] * a.a) * k) / aa)
  return [mix(0), mix(1), mix(2), aa]
}

const stop = (c, at, a = 1) => ({ c, at, a })
// A flat wash over the whole box — for modelling a translucent panel FILL,
// where what matters is the alpha, not where the gradient sits.
const flat = (color, alpha) => () => [...color, alpha]
const over = (fg, bg) => [0, 1, 2].map((i) => fg[3] * fg[i] + (1 - fg[3]) * bg[i])
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const L = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])
const ratio = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

// Overlays every dark tile in the app actually wears. Both are hover states,
// and both LIGHTEN the surface, so the honest worst case for the text sitting
// on that surface includes them — a KPI figure has to stay readable while the
// sheen is sweeping across it, not only when the card is at rest.
const SHEEN = linear(115, [stop([255, 255, 255], 0.30, 0), stop([255, 255, 255], 0.48, 0.14),
                           stop([255, 255, 255], 0.56, 0.032), stop([255, 255, 255], 0.72, 0)])
const SPOTLIGHT = radial(16.25, 16.25, 50, 0, [232, 80, 2], 60, 0.18)

/* The probes.

   Each surface is scored ONLY against the text it actually carries, at that
   text's real size and weight. Testing every colour on every surface sounds
   more rigorous and is the opposite: `text-blue-400` never appears on the
   greeting hero, so scoring it there manufactures a failure, and a fake
   failure gets "fixed" by dulling a gradient nobody had a problem with.

   AA thresholds: 3:1 for large text (>=24px, or >=18.66px at 700+), else 4.5:1.
   The sizes below are read off the JSX, not guessed. */
const P = (label, color, need, { alpha = 1, groundOver = null } = {}) =>
  ({ label, color, alpha, need, groundOver })

const WHITE = [255, 255, 255]
const BLUE400 = hex('#fa6f28')       // --color-blue-400, the KPI figure colour
const GLASS_PANEL = [...WHITE, 0.14] // .glass-panel, the chip inside the hero

// h1 at text-2xl/3xl bold -> large. The date label above it is text-xs
// on-dark-muted -> small, and it is the strictest thing on the hero.
const HERO_PROBES = [
  P('h1 white 24px bold', WHITE, 3),
  P('date label 12px', WHITE, 4.5, { alpha: 0.76 }),
  P('chip white 14px', WHITE, 4.5, { groundOver: GLASS_PANEL }),
]
// The KPI / document tiles: a 30px bold orange figure (large text), a 12px
// label, and a chevron icon.

const TILE_PROBES = [
  P('h2 white 14px bold', WHITE, 4.5),
  P('label 12px', WHITE, 4.5, { alpha: 0.76 }),
  P('chevron icon', WHITE, 3, { alpha: 0.55 }),
  P('figure 30px bold', BLUE400, 3),
]
// The client's "needs your attention" list is also a .tile-dark, but it is the
// one that carries NO sheen — so it gets its own entry rather than borrowing
// the KPI tile's numbers. Its 12px semibold orange amount is the strictest
// thing on any dark surface in the app.
const ATTENTION_PROBES = [
  P('row label 14px', WHITE, 4.5),
  P('ref 12px', WHITE, 4.5, { alpha: 0.76 }),
  P('amount 12px semibold', BLUE400, 4.5),
]
// The auth card. Everything on it is small: a 14px label, a 12px helper line,
// an 18px input value, and the icon in the header badge. Nothing here is large
// text except the h1, so almost all of it owes the full 4.5:1.
const INPUT_WELL = [255, 255, 255, 0.06]
const ORANGE_WELL = [232, 80, 2, 0.18]
const AUTH_PROBES = [
  P('h1 white 24px bold', WHITE, 3),
  P('label 14px', WHITE, 4.5, { alpha: 0.84 }),
  P('helper 12px', WHITE, 4.5, { alpha: 0.72 }),
  P('faint 12px', WHITE, 4.5, { alpha: 0.58 }),
  P('input value 18px', WHITE, 4.5, { groundOver: INPUT_WELL }),
  P('placeholder 18px', WHITE, 4.5, { alpha: 0.56, groundOver: INPUT_WELL }),
  P('badge icon (graphic)', hex('#ff9a68'), 3, { groundOver: ORANGE_WELL }),
]

// The CTA is a single row of white text: 16px bold is NOT large text, so it
// needs the full 4.5 even though it looks like a heading.
const EMBER_PROBES = [
  P('CTA white 16px bold', WHITE, 4.5),
  P('CTA sub 14px', WHITE, 4.5, { alpha: 0.76 }),
]

// The app-wide surfaces, in the order they stack. PAGE_LAYERS is the brand
// gradient on body::before; every card in the app is composited over it.
const PAGE_LAYERS = [
  radial(58, 42, 6, -8,   [241, 96, 1],    62, 0.30),
  radial(48, 38, 104, 6,  [193, 8, 1],     64, 0.28),
  radial(54, 44, 48, 108, [217, 195, 171], 66, 0.10),
  linear(168, [stop(hex('#150e0b'), 0), stop(hex('#000000'), 0.52), stop(hex('#0d0705'), 1)]),
]
const CARD_FILL = (a1, a2) => linear(158, [stop([52, 36, 29], 0, a1), stop([12, 8, 6], 1, a2)])
const WELL = linear(0, [stop([255, 255, 255], 0, 0.07), stop([255, 255, 255], 1, 0.07)])

// The five steps of the ink ramp, at the sizes they are actually used.
const INK_PROBES = [
  P('ink        #fff', WHITE, 4.5),
  P('ink-strong  .86', WHITE, 4.5, { alpha: 0.86 }),
  P('ink-mid     .78', WHITE, 4.5, { alpha: 0.78 }),
  P('ink-muted   .72', WHITE, 4.5, { alpha: 0.72 }),
  P('ink-faint   .58', WHITE, 4.5, { alpha: 0.58 }),
  P('placeholder .56', WHITE, 4.5, { alpha: 0.56 }),
]

// Sample a surface. `layers` are listed TOP-first, exactly as CSS lists them.
function hotspot(name, W, H, layers, probes) {
  let best = null
  for (let y = 0; y <= H; y += 2) {
    for (let x = 0; x <= W; x += 2) {
      let px = [0, 0, 0]
      for (let i = layers.length - 1; i >= 0; i--) px = over(layers[i](x, y, W, H), px)
      const l = L(px)
      if (!best || l > best.l) best = { l, px, x, y }
    }
  }
  const g = best.px.map(Math.round)
  const rows = probes.map((p) => {
    const ground = p.groundOver ? over(p.groundOver, g).map(Math.round) : g
    const got = ratio(over([...p.color, p.alpha], ground), ground)
    return { label: p.label, got: +got.toFixed(2), need: p.need, pass: got >= p.need }
  })
  return { name, ground: g, at: `${Math.round((best.x / W) * 100)}%,${Math.round((best.y / H) * 100)}%`, rows }
}

/* ============================================================================
   THE SURFACES — keep these in step with src/styles/index.css.

   Sizes are the real ones: a phone at 360px, a tablet, a wide desktop, and the
   KPI grid at two and four columns. A bloom is positioned in PERCENT but sized
   in REM, so its hot spot moves with the box — a tile that passes at 340px
   wide can fail at 152px, because there the same bloom fills the whole card
   instead of licking one corner. That is why every surface is sampled at more
   than one size, and it is the failure mode a screenshot never shows you.
   ============================================================================ */
// The ::before overlay shared by all three dark surfaces. The 1px white rim
// that lives in the same CSS layer is deliberately NOT modelled: it is the
// brightest pixel on the card by a distance, so including it would peg every
// hot spot to a hairline no text ever sits on, and every reading below would
// be measured against a ground that does not exist under any glyph.
const SAND_WASH = linear(165, [stop([217, 195, 171], 0, 0.15), stop([217, 195, 171], 0.42, 0)])

const TILE_LAYERS = [
  SPOTLIGHT,
  SAND_WASH,
  radial(14, 9, 78, 128, [193, 8, 1], 60, 0.34),
  radial(11, 7, 104, -22, [241, 96, 1], 58, 0.20),
  linear(168, [stop(hex('#17110d'), 0), stop(hex('#0a0605'), 0.66), stop(hex('#0a0605'), 1)]),
]

const SURFACES = {
  /* The page itself — the brand gradient on body::before. Everything else in
     the app is composited over this, so it is the root of every reading below.
     Text sits directly on it too: section labels, empty states, the footer. */
  'PAGE (body gradient)': {
    sizes: [[380, 760], [768, 1024], [1440, 900]],
    probes: INK_PROBES,
    layers: PAGE_LAYERS,
  },
  /* The default card. This is the surface the whole app is made of, and the
     one the ink ramp is tuned against. Note how little separation it has from
     the page — about 1.06:1 — which is why the card rule carries a lit top
     edge; on a dark ground the highlight does the work a drop shadow does on
     a light one. */
  'CARD (glass .34/.52)': {
    sizes: [[380, 760], [768, 1024], [1440, 900]],
    probes: INK_PROBES,
    layers: [CARD_FILL(0.34, 0.52), ...PAGE_LAYERS],
  },
  /* A card inside a card, or any `--well`. Lighter than its host by design, so
     it is the worst case for the ink ramp and has to be checked separately. */
  'CARD nested / well': {
    sizes: [[380, 600], [768, 800]],
    probes: INK_PROBES,
    layers: [WELL, CARD_FILL(0.34, 0.52), ...PAGE_LAYERS],
  },
  /* Dialogs use the strong fill: they are the densest thing in the app and sit
     over a blurred overlay, so they can afford to be less see-through. */
  'MODAL (strong .52/.68)': {
    sizes: [[380, 700], [640, 800]],
    probes: INK_PROBES,
    layers: [CARD_FILL(0.52, 0.68), ...PAGE_LAYERS],
  },
  /* The auth card, rebuilt 2026-09-02 as DARK glass.

     It used to be white at 0.90 alpha, which composites to a flat rgb(230,230,230)
     over the stage — grey plastic, with nothing of the background coming
     through. That is not a tuning problem, it is the wrong way round: light
     glass on a dark ground has to be nearly opaque to keep small dark text
     legible, and at that opacity it stops being glass. Dark glass on a dark
     ground has the opposite budget — it can sit at 0.55 and still carry white
     text at 12:1, so the bloom actually shows through.

     Modelled conservatively in two ways. The fill is taken at its LIGHTEST
     alpha (0.55, the top of its gradient) rather than the 0.72 it reaches at
     the bottom; and it is composited over the hot spot of the WHOLE stage
     rather than the patch the card really covers, since the card is centred
     and the stage's bright corner moves with the viewport.

     The backdrop-filter is not modelled. blur() averages the backdrop, which
     lowers its peak, while saturate(180%) raises it; taking the unblurred hot
     spot bounds the pair. */
  'auth-card (dark glass)': {
    sizes: [[380, 720], [768, 900], [1440, 900]],
    probes: AUTH_PROBES,
    layers: [
      flat([46, 32, 26], 0.55),
      radial(44, 32, 82, -18, [241, 96, 1], 60, 0.62),
      radial(36, 30, -12, 108, [193, 8, 1], 64, 0.52),
      radial(30, 24, 50, 52, [217, 195, 171], 70, 0.10),
      linear(155, [stop(hex('#140d09'), 0), stop(hex('#000000'), 0.55), stop(hex('#0a0605'), 1)]),
    ],
  },
  // The greeting hero. This is the card that follows the reference: charcoal at
  // the top, crimson rising out of the bottom edge, one orange ember off the
  // far top corner so the sand wash has something to be a reflection of.
  // Only white text sits on it.
  'hero-dark': {
    sizes: [[328, 148], [360, 220], [760, 176], [1100, 160]],
    probes: HERO_PROBES,
    layers: [
      SHEEN, SAND_WASH,
      radial(26, 17, 30, 126, [241, 96, 1], 58, 0.42),
      radial(40, 26, 66, 132, [193, 8, 1], 64, 0.60),
      radial(22, 15, 98, -34, [241, 96, 1], 56, 0.20),
      linear(176, [stop(hex('#1b1411'), 0), stop(hex('#0e0908'), 0.44), stop(hex('#0a0605'), 1)]),
    ],
  },
  // The KPI / document tiles. Same light direction as the hero, deliberately
  // dimmer: they carry a 30px ORANGE figure, and orange text on a red-lit
  // ground is the one combination in this palette that collapses.
  'tile-dark (KPI)': {
    sizes: [[152, 118], [172, 130], [268, 140], [340, 224]],
    probes: TILE_PROBES,
    layers: [SHEEN, ...TILE_LAYERS],
  },
  // Same surface, but the client's attention list carries no `sheen`, so it is
  // scored without one. Its 12px semibold orange amount is the strictest ask
  // on any dark surface in the app.
  'tile-dark (attention list)': {
    sizes: [[328, 220], [360, 240], [720, 200]],
    probes: ATTENTION_PROBES,
    layers: TILE_LAYERS,
  },
  // The one tile that gets the reference at full strength: the client's
  // "Report a problem" CTA. It can afford it because it carries white text
  // only — no orange figure to drown.
  'tile-ember': {
    sizes: [[328, 92], [360, 104], [520, 100]],
    probes: EMBER_PROBES,
    layers: [
      SHEEN, SPOTLIGHT, SAND_WASH,
      radial(20, 12, 24, 132, [241, 96, 1], 58, 0.44),
      radial(28, 16, 70, 136, [193, 8, 1], 62, 0.62),
      linear(172, [stop(hex('#1b1411'), 0), stop(hex('#0c0706'), 0.52), stop(hex('#0a0605'), 1)]),
    ],
  },
}

/* Two passes, and the difference between them matters.

   AT REST is the bar. Every text colour on a dark surface must clear AA
   against the lightest point that surface reaches when nothing is happening.
   A failure here is a real defect and this script exits non-zero for it.

   SHEEN PEAK is advisory. `.sheen` washes 22% white across a card for ~400ms
   on hover, and only on pointer devices; the phones this app mostly runs on
   never fire it. It is reported because a figure that vanishes under the sweep
   is worth knowing about, but it is not a build failure — otherwise the
   "fix" would be deleting an animation the app is fine with. Watch the gap
   though: where a surface passes at rest by a hair, the sweep is the moment
   the user actually notices. */
let failed = 0
for (const [name, s] of Object.entries(SURFACES)) {
  for (const [w, h] of s.sizes) {
    const rest = hotspot(name, w, h, s.layers.filter((l) => l !== SHEEN), s.probes)
    const peak = hotspot(name, w, h, s.layers, s.probes)
    console.log(`\n${name}  ${w}x${h}`)
    console.log(`   rest rgb(${rest.ground.join(',')}) at ${rest.at}   ·   sheen peak rgb(${peak.ground.join(',')})`)
    rest.rows.forEach((row, i) => {
      const p = peak.rows[i]
      if (!row.pass) failed++
      console.log(`   ${row.pass ? 'ok  ' : 'FAIL'} ${row.label.padEnd(22)} rest ${String(row.got).padStart(6)}  ` +
                  `peak ${String(p.got).padStart(6)}${p.pass || !s.layers.includes(SHEEN) ? '' : '  <- sweep dips under'}   needs ${row.need}`)
    })
  }
}
console.log(`\n${failed} at-rest failure(s).`)
process.exit(failed ? 1 : 0)
