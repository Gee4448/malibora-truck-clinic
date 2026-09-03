/* Renders the client dashboard's greeting hero and reports its geometry and the
 * contrast of the greeting against whatever ends up behind it.
 *
 * Everything visual is EXTRACTED from src/pages/client/ClientDashboard.jsx and
 * src/components/common/TruckMark.jsx rather than retyped. A harness that
 * retypes the thing it is checking is checking the copy: an early version wrote
 * `w-[340px]` while the component shipped `w-[300px] sm:w-[340px]`, Tailwind had
 * never generated the bare class, and the truck silently rendered at double
 * size. Every extraction below throws if its anchor moves, so the harness fails
 * loudly instead of quietly drifting away from the page.
 *
 *   node scripts/hero-probe.mjs 1100 520          # lg: callouts visible
 *   node scripts/hero-probe.mjs 900 480           # between sm and lg
 *   node scripts/hero-probe.mjs 520 460 375       # phone geometry
 *   node scripts/hero-probe.mjs 1100 520 0 sw     # Swahili labels
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { decodePNG, lum, ratio, hex, worstIn } from './lib/png.mjs'
import { truckSVG } from './lib/truck-svg.mjs'

const W = Number(process.argv[2] || 900), H = Number(process.argv[3] || 560)
/* Phone geometry without a phone. Headless floors its window near 500px, so to
   reproduce a 375px card the VIEWPORT stays small (under the 640px `sm:` break,
   so the mobile classes are the ones that apply) while the container is pinned
   narrow. Both halves matter: a wide viewport would resolve `sm:` variants a
   phone never sees, and a wide container would give the truck room it lacks. */
const CONTAINER = Number(process.argv[4] || 0)
const LOCALE = process.argv[5] || 'en'
const repo = process.cwd().replace(/\\/g, '/')
const css = readFileSync('dist/assets/' + readdirSync('dist/assets').find(f => f.endsWith('.css')), 'utf8')

const page = readFileSync('src/pages/client/ClientDashboard.jsx', 'utf8')
const pick = (re, what) => {
  const m = page.match(re)
  if (!m) throw new Error(`hero-probe: could not find ${what} in ClientDashboard.jsx — the markup moved`)
  return m
}
const heroCls = pick(/<div className="(sheen hero-dark[^"]*)"/, 'hero classes')[1]
const blobCls = pick(/<div className="(absolute -top-16[^"]*)"/, 'blob classes')[1]
const wrapCls = pick(/<div className="(absolute lg:relative[^"]*)"/, 'truck/callout wrapper')[1]
const chipCls = pick(/<div className="(lg:hidden glass-panel[^"]*)"/, 'stats chip')[1]
const truckCls = pick(/<TruckMark className="([^"]*)"/, 'TruckMark classes')[1]

/* The callout list, lifted whole and rendered twice with real values. */
const ul = pick(/<ul className="([^"]*)">([\s\S]*?)<\/ul>/, 'callout list')
const liMatch = ul[2].match(/<li[\s\S]*<\/li>/)
if (!liMatch) throw new Error('hero-probe: no <li> inside the callout list')
const liTemplate = liMatch[0]   // NOT ul[2]: that still wraps the .map(spec => ( ... )) text
const i18n = JSON.parse(readFileSync(`src/i18n/${LOCALE}.json`, 'utf8'))
const specs = [
  { value: '2', label: i18n.client.dashboard.activeServices },
  { value: 'TZS 4,636,000', label: i18n.client.dashboard.amountDue },
]
const callouts = `<ul class="${ul[1]}">` + specs.map(s => liTemplate
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/key=\{spec\.label\}\s*/, '')
  .replace(/\{spec\.value\}/g, s.value)
  .replace(/\{spec\.label\}/g, s.label)
  .replace(/className=/g, 'class=')
  .replace(/aria-hidden\b(?!=)/g, 'aria-hidden="true"')).join('') + '</ul>'

const build = inkVisible => `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>hero probe</title><style>${css}${inkVisible ? '' : `
  /* Ink off: we need the pixels the glyphs SIT ON, not the glyphs. */
  #hero h1, #hero p, #hero span { color: transparent !important; }
  #hero .glass-panel { display: none !important; }`}</style>
<div class="min-h-screen"><main class="max-w-3xl mx-auto px-4 py-5"${CONTAINER ? ` style="max-width:${CONTAINER}px"` : ''}>
  <div id="hero" class="${heroCls}">
    <div class="${blobCls}"></div>
    <div class="${wrapCls}">
      ${truckSVG(truckCls)}
    </div>
    <div class="relative">
      <p class="on-dark-muted text-xs font-medium font-display tracking-wide uppercase">Thursday 3 September</p>
      <h1 class="text-2xl font-bold mt-1 leading-tight">${i18n.client.dashboard.welcome}, Godson <span class="inline-block">&#128075;</span></h1>
      <div class="${chipCls}"><span class="whitespace-nowrap"><span class="font-bold">2</span> ${String(i18n.client.dashboard.activeServices).toLowerCase()}</span></div>
      ${callouts}
    </div>
  </div>
  <pre id="out" class="mt-3 text-[11px] leading-5 text-white"></pre>
</main></div>
<script>
  var h = document.getElementById('hero'), r = h.getBoundingClientRect();
  var s = h.querySelector('svg').getBoundingClientRect();
  var ul = h.querySelector('ul'), u = ul ? ul.getBoundingClientRect() : null;
  var g = h.querySelector('h1').getBoundingClientRect();
  var de = document.documentElement;
  document.getElementById('out').textContent = [
    'viewport / card   ' + de.clientWidth + '  /  ' + Math.round(r.width) + ' x ' + Math.round(r.height),
    'truck             ' + Math.round(s.width) + ' x ' + Math.round(s.height),
    'callouts          ' + (u && u.width ? Math.round(u.width) + ' x ' + Math.round(u.height) : 'hidden (below lg)'),
    'truck inside card ' + (s.top >= r.top - 0.5 && s.bottom <= r.bottom + 0.5 && s.right <= r.right + 0.5),
    'greeting 1 line   ' + (g.height < 40),
    'callouts vs truck ' + (!u || !u.width ? 'n/a' : (u.right <= s.left + 0.5 ? 'clear' : 'OVERLAP')),
    'page h-overflow   ' + (de.scrollWidth > de.clientWidth)
  ].join('\\n');
<\/script>`

const shot = (file, html) => {
  writeFileSync(`dist/${file}.html`, html)
  execFileSync('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
     `--window-size=${W},${H}`, `--screenshot=${repo}/dist/${file}.png`,
     `file:///${repo}/dist/${file}.html`], { stdio: 'ignore' })
}

const tag = `hero-${W}${CONTAINER ? `w-${CONTAINER}c` : ''}-${LOCALE}`
shot(tag, build(true))
shot(`${tag}-noink`, build(false))
console.log(`rendered dist/${tag}.png`)

/* Where the card is narrow the greeting and the truck share space and the mark
   becomes a watermark BEHIND white text. Sample the left text column at its
   lightest pixel — clear 4.5:1 there and it clears every stroke of the art. */
const img = decodePNG(readFileSync(`dist/${tag}-noink.png`))
const heroW = (CONTAINER ? Math.min(CONTAINER, img.w) : Math.min(768, img.w)) - 32
const cardW = CONTAINER ? Math.min(CONTAINER, img.w) : Math.min(768, img.w)
const heroX = Math.max(0, Math.round((img.w - cardW) / 2)) + 16
const s = worstIn(img, heroX + 20, 40, Math.round(heroW * 0.66), (W < 640 ? 190 : 176) - 40)
const cr = ratio(lum(255, 255, 255), s.worstL)
console.log(`  text column worst ${hex(...s.worst)}  white ${cr.toFixed(2)}:1  ${cr >= 4.5 ? 'PASS' : 'FAIL'}`)
