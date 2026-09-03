/* Proves the scroll-reactive chrome: that the bar actually condenses, that the
 * progress line appears only once the page has moved, and that its width really
 * tracks --scroll-progress.
 *
 *   node scripts/chrome-probe.mjs            # office + client bars
 *   node scripts/chrome-probe.mjs 520 812 375   # at phone width
 *
 * The third argument pins the bar's own width. Headless floors its window near
 * 500px, so `--window-size=375` still lays the bar out at 500 — the first run
 * of this probe reported "of 500px" for a 375px window and was measuring a
 * viewport no phone has.
 *
 * Why the state is set rather than scrolled to: this pane pauses rAF and
 * IntersectionObserver when it is not painting, so a harness that scrolls and
 * then reads is measuring whether the frame happened to run, not whether the
 * CSS is right. The two halves are checked separately instead — the arithmetic
 * that turns a scroll offset into `data-scrolled` and `--scroll-progress` has
 * its own unit tests against the real src/lib/scrollChrome.js (npm test), and
 * this file checks what the CSS does with those two values.
 *
 * Every class string is EXTRACTED from the components. A harness that retypes
 * the header is measuring its own copy, and this one would miss exactly the
 * mistake it exists to catch: a `.bar-row` that never made it into the markup.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const W = Number(process.argv[2] || 1200), H = Number(process.argv[3] || 700)
const CONTAINER = Number(process.argv[4] || 0)
const repo = process.cwd().replace(/\\/g, '/')
const css = readFileSync('dist/assets/' + readdirSync('dist/assets').find(f => f.endsWith('.css')), 'utf8')

const pick = (file, re, what) => {
  const m = readFileSync(file, 'utf8').match(re)
  if (!m) throw new Error(`chrome-probe: could not find ${what} in ${file} — the markup moved`)
  return m[1]
}

const officeBar = pick('src/components/layout/Header.jsx',
  /<header className="(app-bar[^"]*)"/, 'office header')
const clientBar = pick('src/components/layout/ClientLayout.jsx',
  /<header className="(app-bar[^"]*)"/, 'client header')
const clientRow = pick('src/components/layout/ClientLayout.jsx',
  /<div className="(bar-row[^"]*)"/, 'client header row')
const mechRow = pick('src/components/layout/MechanicLayout.jsx',
  /<div className="(bar-row[^"]*)"/, 'mechanic header row')

if (clientRow !== mechRow) {
  console.log('note: client and mechanic header rows differ\n  client: ' + clientRow + '\n  mech:   ' + mechRow)
}

const page = `<!doctype html><meta charset="utf-8"><title>chrome probe</title>
<style>${css}</style>
<style>
  /* Transitions off, deliberately. getComputedStyle during a transition returns
     the value at that instant, and reading straight after flipping the
     attribute returns the value it is transitioning FROM — the first version of
     this probe measured 64px -> 64px and reported the condensation broken when
     the CSS was fine. The end state is what these assertions are about; that a
     transition exists at all is asserted separately, off .app-bar's own
     transition-property. */
  *, *::before, *::after { transition: none !important; animation: none !important; }
</style>
<div style="${CONTAINER ? `width:${CONTAINER}px;overflow:hidden` : ''}">
<header id="office" class="${officeBar}">
  <button class="p-2 rounded-lg text-white/80">MENU</button>
  <div class="flex items-center gap-3 ml-auto">
    <span class="px-3 py-1.5 rounded-lg text-sm font-medium text-white/85 bg-white/10">EN</span>
    <span class="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center text-white text-sm font-bold">G</span>
  </div>
</header>
<header id="client" class="${clientBar}">
  <div id="client-row" class="${clientRow}">
    <div class="flex items-center gap-2.5">
      <span class="w-9 h-9 rounded-xl bg-blue-700 flex items-center justify-center shrink-0"></span>
      <div><h1 class="text-sm font-bold leading-tight text-white">Malibora</h1>
      <p class="on-dark-muted text-[10px]">Antony Mushi</p></div>
    </div>
    <span class="px-3 py-1.5 rounded-lg text-sm text-white/85 bg-white/10">EN</span>
  </div>
</header>
</div>
<div style="height:2400px"></div>
<script>
  var root = document.documentElement;
  var read = function () {
    var o = document.getElementById('office'), c = document.getElementById('client');
    var row = document.getElementById('client-row');
    var pb = getComputedStyle(o, '::before');
    return {
      officeH: Math.round(o.getBoundingClientRect().height),
      clientH: Math.round(c.getBoundingClientRect().height),
      rowPadTop: getComputedStyle(row).paddingTop,
      lineWidth: pb.width,
      lineOpacity: pb.opacity,
      barWidth: Math.round(o.getBoundingClientRect().width)
    };
  };
  var out = {};
  root.dataset.scrolled = '0';
  root.style.setProperty('--scroll-progress', '0');
  out.rest = read();
  root.dataset.scrolled = '1';
  root.style.setProperty('--scroll-progress', '0.5');
  out.half = read();
  root.style.setProperty('--scroll-progress', '1');
  out.end = read();
  var j = document.createElement('pre'); j.id = 'json'; j.hidden = true;
  j.textContent = JSON.stringify(out);
  document.body.appendChild(j);
</scr` + `ipt>`

writeFileSync('dist/chrome-probe.html', page)

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const flags = ['--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
               `--window-size=${W},${H}`]
const dom = execFileSync(chrome, [...flags, '--dump-dom', `file:///${repo}/dist/chrome-probe.html`],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const jm = dom.match(/<pre id="json" hidden="">([\s\S]*?)<\/pre>/)
if (!jm) throw new Error('chrome-probe: no measurements in the dumped DOM')
const g = JSON.parse(jm[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'))

/* Transitions are still running when the DOM is dumped, so heights are asserted
   as "moved in the right direction and far enough", not as exact endpoints. */
const line = (label, ok, detail) =>
  console.log(`  ${(label + '                          ').slice(0, 26)}${detail}  ${ok ? 'PASS' : 'FAIL'}`)

console.log(`viewport     ${W}px window${CONTAINER ? `, bar pinned to ${CONTAINER}px` : ''}`)
console.log(`office bar   ${g.rest.officeH}px at rest  ->  ${g.end.officeH}px scrolled`)
console.log(`client bar   ${g.rest.clientH}px at rest  ->  ${g.end.clientH}px scrolled`)
console.log(`row padding  ${g.rest.rowPadTop} at rest  ->  ${g.end.rowPadTop} scrolled\n`)

line('office bar condenses', g.end.officeH < g.rest.officeH, `${g.rest.officeH} -> ${g.end.officeH}`)
line('client bar condenses', g.end.clientH < g.rest.clientH, `${g.rest.clientH} -> ${g.end.clientH}`)
line('row padding tightens', parseFloat(g.end.rowPadTop) < parseFloat(g.rest.rowPadTop),
  `${g.rest.rowPadTop} -> ${g.end.rowPadTop}`)
line('line hidden at rest', g.rest.lineOpacity === '0', `opacity ${g.rest.lineOpacity}`)
line('line shown when scrolled', g.end.lineOpacity !== '0', `opacity ${g.end.lineOpacity}`)

const half = parseFloat(g.half.lineWidth), full = parseFloat(g.end.lineWidth), bar = g.end.barWidth
line('line tracks progress', Math.abs(half - bar / 2) < 2 && Math.abs(full - bar) < 2,
  `0.5 -> ${g.half.lineWidth}, 1 -> ${g.end.lineWidth} of ${bar}px`)

/* The page above has transitions forced off, so it cannot say whether the
   condensation is animated or snaps. That is read out of the shipped stylesheet
   instead — still the built artefact, not a retyped copy. */
const ruleFor = sel => {
  const m = css.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}'))
  return m ? m[1] : ''
}
const barRule = ruleFor('.app-bar'), rowRule = ruleFor('.bar-row')
line('bar height animates', /transition:[^;]*height/.test(barRule),
  (barRule.match(/transition:[^;]*/) || ['(none)'])[0].slice(0, 46))
line('row padding animates', /transition:[^;]*padding/.test(rowRule),
  (rowRule.match(/transition:[^;]*/) || ['(none)'])[0].slice(0, 46))
