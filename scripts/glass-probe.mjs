/* Measures what a glass surface ACTUALLY composites to, by sampling rendered
 * pixels.
 *
 * Necessary because `backdrop-filter` output cannot be derived from CSS: the
 * panel's own fill is only half of it, the rest is a blurred, saturated copy of
 * whatever gradient happens to sit behind that spot on that viewport. Reading
 * the stylesheet tells you nothing, and getComputedStyle reports the fill, not
 * the composite. So: render it in a real browser, screenshot, decode, sample.
 *
 *   node scripts/glass-probe.mjs            # after npm run build
 *
 * The tiles carry a 30px orange figure (`text-blue-400`, #fa6f28). Orange ink
 * on a lit ground is the one combination in this palette that collapses, so
 * every tile is scored at its WORST pixel (the lightest point under the glyph),
 * not its average — an average passes while the corner nearest the bloom fails.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { decodePNG, lum, ratio, hex, worstIn } from './lib/png.mjs'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const repo = process.cwd().replace(/\\/g, '/')

// --- the page ----------------------------------------------------------------
const cssFile = readdirSync('dist/assets').find(f => f.endsWith('.css'))
const css = readFileSync(`dist/assets/${cssFile}`, 'utf8')

// Tiles laid across the full width so each meets a different part of the fixed
// background gradient -- the leftmost sits under the orange radial at 6% -8%,
// the rightmost under the red one at 104% 6%.
/* The figure is laid out but NOT painted: we need the pixels the glyphs would
   sit on, so sampling must not catch the glyphs themselves. Same box, no ink. */
const tile = (i) => `
  <div class="tile-dark rounded-3xl p-4" style="height:132px" data-probe="tile${i}">
    <div class="w-10 h-10 bg-white/10 rounded-2xl"></div>
    <p class="text-3xl font-bold mt-3 font-display tabular-nums" style="color:transparent">00</p>
  </div>`

const page = `<!doctype html><meta charset="utf-8"><title>glass probe</title>
<style>${css}</style>
<div class="min-h-screen p-4 lg:p-6">
  <div class="max-w-6xl mx-auto space-y-6">
    <div class="hero-dark rounded-3xl p-6" data-probe="hero" style="height:120px">
      <p class="text-xs uppercase" style="color:transparent">Wednesday, 3 September 2026</p>
      <h1 class="text-2xl font-bold mt-1" style="color:transparent">Welcome back, Antony</h1>
    </div>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      ${[0, 1, 2, 3].map(tile).join('')}
    </div>
  </div>
</div>
<script>
  window.__rects = () => Object.fromEntries([...document.querySelectorAll('[data-probe]')]
    .map(el => { const r = el.getBoundingClientRect();
      return [el.dataset.probe, [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]] }));
<\/script>`
writeFileSync('dist/glass-probe.html', page)

// --- render & sample ---------------------------------------------------------
const INK = { hex: '#fa6f28', rgb: [250, 111, 40], name: 'text-blue-400 (KPI figure)' }
const WHITE = { hex: '#ffffff', rgb: [255, 255, 255], name: 'white (hero heading)' }

for (const [label, W, H] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
  execFileSync(CHROME, ['--headless', '--disable-gpu', '--hide-scrollbars',
    `--window-size=${W},${H}`, `--screenshot=${repo}/dist/glass-${label}.png`,
    `file:///${repo}/dist/glass-probe.html`], { stdio: 'ignore' })
  const img = decodePNG(readFileSync(`dist/glass-${label}.png`))

  console.log(`\n=== ${label}  ${img.w}x${img.h} ===`)
  // Tile geometry is deterministic from the layout; sample the band the 30px
  // figure occupies (below the 40px icon + its 12px gap), inset from the edges.
  const cols = label === 'desktop' ? 4 : 2
  const rows = label === 'desktop' ? 1 : 2
  const gridY = label === 'desktop' ? 24 + 120 + 24 : 16 + 120 + 24
  const pad = label === 'desktop' ? 24 : 16
  const gridW = img.w - pad * 2
  const tw = (gridW - 12 * (cols - 1)) / cols
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = Math.round(pad + c * (tw + 12)) + 16
      const y = Math.round(gridY + r * (132 + 12)) + 16 + 40 + 12
      const s = worstIn(img, x, y, Math.max(8, Math.round(tw) - 40), 30)
      const cr = ratio(lum(...INK.rgb), s.worstL)
      console.log(`  tile ${r * cols + c}  worst ${hex(...s.worst)}  avg ${hex(...s.avg)}  ` +
        `orange ${cr.toFixed(2)}:1  ${cr >= 4.5 ? 'PASS' : cr >= 3 ? 'large-text only' : 'FAIL'}`)
    }
  }
  const hs = worstIn(img, pad + 16, (label === 'desktop' ? 24 : 16) + 40, 220, 40)
  const hcr = ratio(lum(...WHITE.rgb), hs.worstL)
  console.log(`  hero      worst ${hex(...hs.worst)}  avg ${hex(...hs.avg)}  ` +
    `white  ${hcr.toFixed(2)}:1  ${hcr >= 4.5 ? 'PASS' : 'FAIL'}`)
}
