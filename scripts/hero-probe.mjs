/* Renders the client dashboard's greeting hero at a given width, using the REAL
 * TruckMark source and the REAL class strings from ClientDashboard.jsx, and
 * reports the card's height.
 *
 * The class strings are pulled from the page rather than retyped. An earlier
 * hand-copied harness wrote `w-[340px]` while the component ships
 * `w-[300px] sm:w-[340px]`; Tailwind only generates what it scanned, so the
 * bare class did not exist, the SVG fell back to 100% width, and the truck
 * rendered at twice its real size. A harness that retypes classes is testing
 * something the app does not ship.
 *
 *   node scripts/hero-probe.mjs 900      # desktop-ish
 *   node scripts/hero-probe.mjs 520      # narrow (headless floors near 500)
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { decodePNG, lum, ratio, hex, worstIn } from './lib/png.mjs'

const W = Number(process.argv[2] || 900), H = Number(process.argv[3] || 560)
/* Phone geometry without a phone. Headless floors its window near 500px, so to
   reproduce a 375px card the VIEWPORT stays small (under the 640px `sm:` break,
   so the mobile classes are the ones that apply) while the container is pinned
   narrow. Both halves matter: a wide viewport would resolve `sm:` variants that
   a phone never sees, and a wide container would give the truck room a phone
   does not have. */
const CONTAINER = Number(process.argv[4] || 0)
const repo = process.cwd().replace(/\\/g, '/')
const css = readFileSync('dist/assets/' + readdirSync('dist/assets').find(f => f.endsWith('.css')), 'utf8')

const page = readFileSync('src/pages/client/ClientDashboard.jsx', 'utf8')
const pick = (re, what) => {
  const m = page.match(re)
  if (!m) throw new Error(`could not read ${what} out of ClientDashboard.jsx`)
  return m[1]
}
const heroCls = pick(/<div className="(sheen hero-dark[^"]*)"/, 'hero classes')
const blobCls = pick(/<div className="(absolute -top-16[^"]*)"/, 'blob classes')
const truckCls = pick(/<TruckMark className="([^"]*)"/, 'TruckMark classes')

// The component's <svg> element, with its className expression resolved.
const svg = readFileSync('src/components/common/TruckMark.jsx', 'utf8')
  .replace(/^[\s\S]*?(<svg)/, '$1')
  .replace(/\s*\)\s*\}\s*$/, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/className=\{`([^`]*)\$\{className\}`\}/, (_, base) => `class="${base}${truckCls}"`)
  .replace(/strokeWidth=/g, 'stroke-width=').replace(/strokeLinecap=/g, 'stroke-linecap=')
  .replace(/strokeLinejoin=/g, 'stroke-linejoin=').replace(/focusable=/g, 'focusable=')

const build = (inkVisible) => `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>hero probe</title><style>${css}${inkVisible ? '' : `
  /* Ink off: we need the pixels the glyphs SIT ON, not the glyphs. */
  #hero h1, #hero p, #hero span { color: transparent !important; }
  #hero .glass-panel { display: none !important; }`}</style>
<div class="min-h-screen"><main class="max-w-3xl mx-auto px-4 py-5"${CONTAINER ? ` style="max-width:${CONTAINER}px"` : ''}>
  <div id="hero" class="${heroCls}">
    <div class="${blobCls}"></div>
    ${svg}
    <div class="relative">
      <p class="on-dark-muted text-xs font-medium font-display tracking-wide uppercase">Thursday 3 September</p>
      <h1 class="text-2xl font-bold mt-1 leading-tight">Welcome, Godson <span class="inline-block">&#128075;</span></h1>
      <div class="glass-panel rounded-2xl px-3.5 py-2 mt-4 inline-flex items-center gap-x-3 text-sm text-white">
        <span class="flex items-center gap-1.5 whitespace-nowrap"><span class="font-bold">2</span> active services</span>
      </div>
    </div>
  </div>
  <pre id="out" class="mt-3 text-[11px] leading-5 text-white"></pre>
</main></div>
<script>
  var h = document.getElementById('hero'), r = h.getBoundingClientRect();
  var svgEl = h.querySelector('svg'), s = svgEl.getBoundingClientRect();
  document.getElementById('out').textContent = [
    'viewport      ' + document.documentElement.clientWidth,
    'hero  w x h   ' + Math.round(r.width) + ' x ' + Math.round(r.height),
    'truck w x h   ' + Math.round(s.width) + ' x ' + Math.round(s.height),
    'truck inside  ' + (s.top >= r.top - 0.5 && s.bottom <= r.bottom + 0.5 && s.right <= r.right + 0.5)
  ].join('\\n');
<\/script>`

const shot = (file, html) => {
  writeFileSync(`dist/${file}.html`, html)
  execFileSync('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
     `--window-size=${W},${H}`, `--screenshot=${repo}/dist/${file}.png`,
     `file:///${repo}/dist/${file}.html`], { stdio: 'ignore' })
}

const tag = CONTAINER ? `${W}w-${CONTAINER}c` : `${W}`
shot(`hero-${tag}`, build(true))
shot(`hero-${tag}-noink`, build(false))
console.log(`rendered dist/hero-${tag}.png`)

/* The greeting is bottom-left and the truck bottom-right; where the card is
   narrow they share space and the truck becomes a watermark BEHIND white text.
   Sample the whole left text column at its lightest pixel -- if white clears
   4.5:1 against that, it clears it against every stroke of the artwork. */
const img = decodePNG(readFileSync(`dist/hero-${tag}-noink.png`))
const heroX = 16, heroY = 20
const heroW = (CONTAINER ? Math.min(CONTAINER, img.w) : Math.min(768, img.w)) - 32
const heroH = W < 640 ? 190 : 176
const s = worstIn(img, heroX + 20, heroY + 20, Math.round(heroW * 0.66), heroH - 40)
const cr = ratio(lum(255, 255, 255), s.worstL)
console.log(`  text column worst ${hex(...s.worst)}  avg ${hex(...s.avg)}  ` +
  `white ${cr.toFixed(2)}:1  ${cr >= 4.5 ? 'PASS' : 'FAIL'}   (${s.n} px sampled)`)
