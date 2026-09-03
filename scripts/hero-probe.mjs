/* Renders a dashboard greeting hero — the CLIENT card by default, the STAFF one
 * with `staff` on the command line — and reports its geometry plus the contrast
 * of the greeting against whatever ends up behind it.
 *
 * Everything visual is EXTRACTED from the page component and from
 * src/components/common/TruckMark.jsx rather than retyped. A harness that
 * retypes the thing it is checking is checking the copy: an early version wrote
 * `w-[340px]` while the component shipped `w-[300px] sm:w-[340px]`, Tailwind had
 * never generated the bare class, and the truck silently rendered at double
 * size. Every extraction below throws if its anchor moves, so the harness fails
 * loudly instead of quietly drifting away from the page.
 *
 * Geometry now comes back through `--dump-dom` instead of only being painted
 * into the screenshot for a human to read, and the contrast sample is taken from
 * the card's MEASURED rect rather than from an assumed one. The assumed rect was
 * wrong: it took the card to be left-aligned, but the client shell is `mx-auto`,
 * so above 768px the sample straddled the page behind the card and reported
 * contrast against pixels the greeting never sits on.
 *
 *   node scripts/hero-probe.mjs 1100 520          # lg: callouts visible
 *   node scripts/hero-probe.mjs 900 480           # between sm and lg
 *   node scripts/hero-probe.mjs 520 460 375       # phone geometry
 *   node scripts/hero-probe.mjs 1100 520 0 sw     # Swahili labels
 *   node scripts/hero-probe.mjs 1280 460 0 en staff
 *   node scripts/hero-probe.mjs 520 460 375 en staff
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { decodePNG, lum, ratio, hex, worstIn } from './lib/png.mjs'
import { truckSVG } from './lib/truck-svg.mjs'

const argv = process.argv.slice(2)
const STAFF = argv.includes('staff')
const pos = argv.filter(a => a !== 'staff')

const W = Number(pos[0] || 900), H = Number(pos[1] || 560)
/* Phone geometry without a phone. Headless floors its window near 500px, so to
   reproduce a 375px card the VIEWPORT stays small (under the 640px `sm:` break,
   so the mobile classes are the ones that apply) while the container is pinned
   narrow. Both halves matter: a wide viewport would resolve `sm:` variants a
   phone never sees, and a wide container would give the truck room it lacks. */
const CONTAINER = Number(pos[2] || 0)
const LOCALE = pos[3] || 'en'
const repo = process.cwd().replace(/\\/g, '/')
const css = readFileSync('dist/assets/' + readdirSync('dist/assets').find(f => f.endsWith('.css')), 'utf8')

const SRC = STAFF ? 'src/pages/Dashboard.jsx' : 'src/pages/client/ClientDashboard.jsx'
const page = readFileSync(SRC, 'utf8')
const pick = (re, what) => {
  const m = page.match(re)
  if (!m) throw new Error(`hero-probe: could not find ${what} in ${SRC} — the markup moved`)
  return m
}
const heroCls = pick(/<div className="(sheen hero-dark[^"]*)"/, 'hero classes')[1]
/* Both heroes float decorative blobs; the client card has one and the staff card
   two, so match the shape rather than a particular offset. They are what the
   `:not(.absolute)` rule in index.css exists for, and dropping them from the
   harness would hide the exact regression that rule prevents. */
const blobs = [...page.matchAll(/<div className="([^"]*absolute -(?:top|bottom)-[^"]*rounded-full[^"]*)"/g)].map(m => m[1])
if (!blobs.length) throw new Error(`hero-probe: no decorative blobs found in ${SRC}`)
/* Anchored on the TruckMark it wraps rather than on its own classes, which
   have now changed twice. */
const wrapCls = pick(/<div className="([^"]*)">\s*<TruckMark/, 'truck wrapper')[1]
const truckCls = pick(/<TruckMark className="([^"]*)"/, 'TruckMark classes')[1]
const dateCls = pick(/<p className="(on-dark-muted text-xs[^"]*)"/, 'date line')[1]
const h1 = pick(/<h1 className="([^"]*)">([\s\S]*?)<\/h1>/, 'greeting h1')

const i18n = JSON.parse(readFileSync(`src/i18n/${LOCALE}.json`, 'utf8'))
const welcome = STAFF ? i18n.dashboard.welcome : i18n.client.dashboard.welcome

/* The greeting is LIFTED, not retyped. It used to be written out here as
   `welcome + ', Godson 👋'`, which quietly threw away the very markup that
   decides how it breaks: the staff card wraps the name and the wave in a
   `whitespace-nowrap` span so the emoji cannot orphan onto its own line, and a
   harness holding its own copy of the string would have reported that fixed
   before it was. Only the dynamic bits are substituted, and anything left
   unresolved throws rather than rendering as literal braces. */
const greeting = h1[2]
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\{t\('[^']*'\)\}/g, welcome)
  .replace(/\{[^{}]*full_name[^{}]*\}/g, 'Godson')
  .replace(/\{' '\}/g, ' ')
  .replace(/className=/g, 'class=')
  .trim()
if (greeting.includes('{')) {
  throw new Error(`hero-probe: unresolved JSX in the greeting — ${greeting}`)
}

/* Client-only furniture: the stats chip and the truck callouts. The staff card
   deliberately has neither — the KPI bento below it already carries those
   figures — so the harness must not invent them here. */
let chipCls = '', callouts = ''
if (!STAFF) {
  chipCls = pick(/<div className="(lg:hidden glass-panel[^"]*)"/, 'stats chip')[1]
  const ul = pick(/<ul className="([^"]*)">([\s\S]*?)<\/ul>/, 'callout list')
  const liMatch = ul[2].match(/<li[\s\S]*<\/li>/)
  if (!liMatch) throw new Error('hero-probe: no <li> inside the callout list')
  const liTemplate = liMatch[0]   // NOT ul[2]: that still wraps the .map(spec => ( ... )) text
  const specs = [
    { value: '2', label: i18n.client.dashboard.activeServices },
    { value: 'TZS 4,636,000', label: i18n.client.dashboard.amountDue },
  ]
  callouts = `<ul class="${ul[1]}">` + specs.map(s => liTemplate
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/key=\{spec\.label\}\s*/, '')
    .replace(/\{spec\.value\}/g, s.value)
    .replace(/\{spec\.label\}/g, s.label)
    .replace(/className=/g, 'class=')
    .replace(/aria-hidden\b(?!=)/g, 'aria-hidden="true"')).join('') + '</ul>'
}

/* The shell each card actually lives in. The client portal centres a 736px
   column; the staff shell has no max-width at all, because its sidebar is an
   overlay drawer rather than a margin — so the staff hero is as wide as the
   viewport less its padding, and a harness that boxed it to 736px would be
   testing a card that does not exist. */
const shell = STAFF
  ? `<main class="p-4 lg:p-6"${CONTAINER ? ` style="max-width:${CONTAINER}px"` : ''}>`
  : `<main class="max-w-3xl mx-auto px-4 py-5"${CONTAINER ? ` style="max-width:${CONTAINER}px"` : ''}>`

const chip = STAFF ? '' :
  `<div class="${chipCls}"><span class="whitespace-nowrap"><span class="font-bold">2</span> ${String(i18n.client.dashboard.activeServices).toLowerCase()}</span></div>`

const build = inkVisible => `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>hero probe</title><style>${css}${inkVisible ? '' : `
  /* Ink off: we need the pixels the glyphs SIT ON, not the glyphs. */
  #hero h1, #hero p, #hero span { color: transparent !important; }
  #hero .glass-panel { display: none !important; }`}</style>
<div class="min-h-screen">${shell}
  <div id="hero" class="${heroCls}">
    ${blobs.map(b => `<div class="${b}"></div>`).join('\n    ')}
    <div class="${wrapCls}">
      ${truckSVG(truckCls)}
    </div>
    <div class="relative">
      <p class="${dateCls}">Thursday 3 September</p>
      <h1 class="${h1[1]}">${greeting}</h1>
      ${chip}
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
  var rows = [
    ['viewport / card',   de.clientWidth + '  /  ' + Math.round(r.width) + ' x ' + Math.round(r.height)],
    ['truck',             Math.round(s.width) + ' x ' + Math.round(s.height)],
    ['callouts',          (u && u.width ? Math.round(u.width) + ' x ' + Math.round(u.height) : 'none at this width')],
    ['truck inside card', (s.top >= r.top - 0.5 && s.bottom <= r.bottom + 0.5 && s.right <= r.right + 0.5)],
    ['greeting 1 line',   (g.height < 44)],
    ['callouts vs truck', (!u || !u.width ? 'n/a' : (u.right <= s.left + 0.5 ? 'clear' : 'OVERLAP'))],
    ['page h-overflow',   (de.scrollWidth > de.clientWidth)]
  ];
  document.getElementById('out').textContent = rows.map(function (kv) {
    return (kv[0] + '                  ').slice(0, 18) + kv[1];
  }).join('\\n');
  /* Machine-readable twin of the same numbers. The screenshot is for eyes; this
     is what the harness asserts on, and what places the contrast sample. */
  /* Parallax: the drift is driven by --scroll-y, so it can be measured by
     setting that property rather than by scrolling — which matters here,
     because this pane pauses rAF when it is not painting and a scrolled-then-
     read harness would be measuring whether a frame happened to run. */
  var driftBefore = {};
  h.querySelectorAll('.drift').forEach(function (el, i) { driftBefore[i] = el.getBoundingClientRect().top });
  var greetBefore = g.top;
  document.documentElement.style.setProperty('--scroll-y', '300');
  var drift = [];
  h.querySelectorAll('.drift').forEach(function (el, i) {
    drift.push({ far: el.className.indexOf('drift-far') >= 0,
                 moved: +(el.getBoundingClientRect().top - driftBefore[i]).toFixed(1) });
  });
  var greetMoved = +(h.querySelector('h1').getBoundingClientRect().top - greetBefore).toFixed(1);
  document.documentElement.style.removeProperty('--scroll-y');

  var j = document.createElement('pre');
  j.id = 'json'; j.hidden = true;
  j.textContent = JSON.stringify({
    drift: drift, greetMoved: greetMoved,
    vw: de.clientWidth,
    card: { x: r.left, y: r.top, w: r.width, h: r.height },
    truck: { w: s.width, h: s.height },
    truckInside: s.top >= r.top - 0.5 && s.bottom <= r.bottom + 0.5 && s.right <= r.right + 0.5,
    truckLeft: s.left, greetingLines: g.height,
    calloutsOverlap: !!(u && u.width && u.right > s.left + 0.5),
    hOverflow: de.scrollWidth > de.clientWidth
  });
  document.body.appendChild(j);
</scr` + `ipt>`

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const flags = ['--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
               `--window-size=${W},${H}`]

const shot = (file, html) => {
  writeFileSync(`dist/${file}.html`, html)
  execFileSync(chrome, [...flags, `--screenshot=${repo}/dist/${file}.png`,
    `file:///${repo}/dist/${file}.html`], { stdio: 'ignore' })
}

const tag = `hero-${STAFF ? 'staff-' : ''}${W}${CONTAINER ? `w-${CONTAINER}c` : ''}-${LOCALE}`
shot(tag, build(true))
shot(`${tag}-noink`, build(false))
console.log(`rendered dist/${tag}.png`)

/* Read the geometry back out of the rendered DOM rather than guessing at it. */
const dom = execFileSync(chrome, [...flags, '--dump-dom', `file:///${repo}/dist/${tag}.html`],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const jm = dom.match(/<pre id="json" hidden="">([\s\S]*?)<\/pre>/)
if (!jm) throw new Error('hero-probe: no geometry in the dumped DOM — did the page script throw?')
const geo = JSON.parse(jm[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'))

const line = (label, ok, detail) =>
  console.log(`  ${(label + '                            ').slice(0, 28)}${detail}  ${ok ? 'PASS' : 'FAIL'}`)
console.log(`  viewport              ${geo.vw}px  (window ${W}px)`)
console.log(`  card                  ${Math.round(geo.card.w)} x ${Math.round(geo.card.h)} at x=${Math.round(geo.card.x)}`)
console.log(`  truck                 ${Math.round(geo.truck.w)} x ${Math.round(geo.truck.h)}`)
line('truck inside card', geo.truckInside, geo.truckInside ? 'yes' : 'CLIPPED')
line('no h-overflow', !geo.hOverflow, geo.hOverflow ? 'OVERFLOWS' : 'clean')

/* Rates come from the stylesheet, not from this file — the whole point of the
   drift is that one number in CSS sets every layer's depth. */
/* The near rate is the FALLBACK inside .drift's var() — it is never declared
   as a custom property of its own, so a regex for '--drift-rate:' finds only
   the far layer and quietly scores both at the same depth. That is what the
   first run of this check did: it reported the near layer failing at 21px
   when 21px was exactly right. */
const nearM = css.match(/--drift-rate,\s*(\.?[0-9.]+)px/)
const farM = css.match(/--drift-rate:\s*(\.?[0-9.]+)px/)
if (!nearM || !farM) throw new Error('hero-probe: could not read both drift rates from the built CSS')
const near = parseFloat(nearM[1]), far = parseFloat(farM[1])
const want = d => +((d.far ? far : near) * 300).toFixed(1)
const driftOk = geo.drift.length > 0 && geo.drift.every(d => Math.abs(d.moved - want(d)) < 1.5)
line('layers drift at their rate', driftOk,
  geo.drift.map(d => (d.far ? 'far ' : 'near ') + d.moved + 'px want ' + want(d)).join('   ')
    || '(no .drift layers)')
line('greeting does not drift', Math.abs(geo.greetMoved) < 0.5, geo.greetMoved + 'px')
if (!STAFF) line('callouts clear truck', !geo.calloutsOverlap, geo.calloutsOverlap ? 'OVERLAP' : 'clear')

/* Where the card is narrow the greeting and the truck share space and the mark
   becomes a watermark BEHIND white text. Sample the left text column at its
   lightest pixel — clear 4.5:1 there and it clears every stroke of the art. */
const img = decodePNG(readFileSync(`dist/${tag}-noink.png`))
const x0 = Math.round(geo.card.x) + 20
const y0 = Math.round(geo.card.y) + 16
const w = Math.round(geo.card.w * 0.66)
const h = Math.round(geo.card.h) - 32
const s = worstIn(img, x0, y0, w, h)
const cr = ratio(lum(255, 255, 255), s.worstL)
console.log(`  text column worst ${hex(...s.worst)}  white ${cr.toFixed(2)}:1  ${cr >= 4.5 ? 'PASS' : 'FAIL'}`)
