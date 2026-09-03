/* Renders the client portal's header + nav ribbon at a given width and makes
 * the page REPORT ITS OWN MEASUREMENTS into the DOM, so a headless screenshot
 * carries the numbers with it.
 *
 * The self-reporting matters: the in-app preview pane disagreed with the
 * rendered pixels about how wide the track was (it said 736px inside a 390px
 * viewport), and a screenshot alone cannot tell you whether a ribbon that ends
 * at the screen edge is scrollable or simply clipped. Numbers painted into the
 * page cannot drift from the layout that produced them.
 *
 *   node scripts/nav-probe.mjs 390
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const W = Number(process.argv[2] || 390), H = Number(process.argv[3] || 844)
const repo = process.cwd().replace(/\\/g, '/')
const css = readFileSync('dist/assets/' + readdirSync('dist/assets').find(f => f.endsWith('.css')), 'utf8')

const tabs = ['Home', 'My Vehicles', 'Inspections', 'Job Cards', 'Invoices', 'Handovers']
const ACTIVE = 4
const chev = (l, i) => `<a style="--seg-i:${i}" class="chev flex items-center justify-center gap-1.5 py-3.5 lg:py-2 text-xs font-semibold whitespace-nowrap ${
  i === ACTIVE ? 'bg-blue-600 text-white' : 'bg-white/10 text-white/80'}"><span style="width:14px;height:14px;display:inline-block;background:currentColor;border-radius:3px"></span>${l}</a>`

writeFileSync('dist/nav-probe.html', `<!doctype html><meta charset="utf-8">
<!-- The SAME viewport meta index.html carries. Without it a mobile-emulated
     browser falls back to the 980px default layout viewport and every narrow
     measurement is meaningless -- which is what made an early run of this probe
     report a 736px track "at 375px". Headless desktop Chrome floors its window
     at ~500px, so for a true 375 read this page in an emulating browser. -->
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>nav probe</title><style>${css}</style>
<div class="min-h-screen">
  <header class="app-bar sticky top-0 z-40">
    <div class="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
      <div class="flex items-center gap-2.5">
        <span class="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 ring-1 ring-white/20 shrink-0"></span>
        <div><h1 class="text-sm font-bold leading-tight text-white">Malibora Truck Clinic</h1>
        <p class="on-dark-muted text-[10px]">Antony Mushi</p></div>
      </div>
      <div class="flex items-center gap-2">
        <span class="rounded-lg bg-white/10 w-7 h-7 inline-block"></span>
        <span class="px-2 py-1.5 rounded-lg text-xs bg-white/10">EN</span>
        <span class="rounded-lg bg-white/10 w-7 h-7 inline-block"></span>
      </div>
    </div>
    <nav class="border-t border-white/10"><div class="max-w-3xl mx-auto px-4 py-2">
      <div id="track" class="chev-track">${tabs.map(chev).join('')}</div>
    </div></nav>
  </header>
  <main class="max-w-3xl mx-auto px-4 py-5">
    <div class="tile-dark rounded-3xl p-4" style="height:150px">
      <div class="w-10 h-10 bg-white/10 rounded-2xl"></div>
      <p class="text-3xl font-bold mt-3 text-blue-400 font-display">12</p>
      <p class="text-xs on-dark-muted mt-0.5">Jobs in progress</p>
    </div>
    <pre id="out" class="mt-4 text-[11px] leading-5 text-white" style="white-space:pre-wrap"></pre>
  </main>
</div>
<script>
  // Same logic as useChevTrack, so the probe exercises what ships.
  var t = document.getElementById('track');
  var overflow = t.scrollWidth - t.clientWidth;
  t.classList.toggle('is-scrollable', overflow > 0);
  if (overflow > 0) { var s = t.children[${ACTIVE}];
    if (s) t.scrollLeft = Math.max(0, Math.min(s.offsetLeft - 6, overflow)); }
  t.classList.toggle('at-start', t.scrollLeft <= 1);
  t.classList.toggle('at-end', t.scrollLeft >= overflow - 1);

  var a = t.children[${ACTIVE}].getBoundingClientRect();
  var tr = t.getBoundingClientRect();
  var de = document.documentElement;
  document.getElementById('out').textContent = [
    'layout viewport   ' + de.clientWidth + ' x ' + de.clientHeight,
    'page scrollWidth  ' + de.scrollWidth + (de.scrollWidth > de.clientWidth ? '   <<< PAGE OVERFLOWS SIDEWAYS' : '   (no h-scroll)'),
    'track client/scroll ' + t.clientWidth + ' / ' + t.scrollWidth + (overflow > 0 ? '  scrollable by ' + overflow : '  fits'),
    'segment height    ' + Math.round(a.height) + 'px' + (a.height >= 44 ? '  >= 44 ok' : '  << under 44'),
    'active tab (' + ${JSON.stringify(tabs[ACTIVE])} + ') left ' + Math.round(a.left - tr.left) + ' right ' + Math.round(a.right - tr.left),
    'active fully visible ' + (a.left >= tr.left - 1 && a.right <= tr.right + 1)
  ].join('\\n');
<\/script>`)

execFileSync('C:/Program Files/Google/Chrome/Application/chrome.exe',
  ['--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${W},${H}`,
   `--screenshot=${repo}/dist/nav-${W}.png`, `file:///${repo}/dist/nav-probe.html`], { stdio: 'ignore' })
console.log(`rendered dist/nav-${W}.png at ${W}x${H}`)
