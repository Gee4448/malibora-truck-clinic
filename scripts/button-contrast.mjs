/* Scores the app's SOLID buttons — white ink on an opaque fill — against WCAG AA.
 *
 *   node scripts/button-contrast.mjs            # failures only
 *   node scripts/button-contrast.mjs --all      # every combination, pass or fail
 *
 * Why this is separate from contrast-audit.js: that probe runs in a browser
 * console against a live page, and nearly every screen in this app is behind a
 * Supabase login there is no local session for. A solid button needs none of
 * that machinery — its fill is opaque, so the composite terminates at the
 * button itself and the whole question is answerable from the built CSS.
 *
 * The class strings are HARVESTED (scripts/harvest-classes.mjs), not listed
 * here, so this measures the combinations the codebase actually contains rather
 * than the ones someone remembered to type out. Everything is rendered with the
 * real dist CSS, because the brand recolour remaps Tailwind's blue ramp to
 * orange in a layer that reading the markup cannot see: a class that says
 * `bg-blue-600` paints orange, and only the built stylesheet knows that.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const ALL = process.argv.includes('--all')
const repo = process.cwd().replace(/\\/g, '/')
const css = readFileSync('dist/assets/' + readdirSync('dist/assets').find(f => f.endsWith('.css')), 'utf8')

if (!existsSync('scripts/.classes.json')) {
  execFileSync(process.execPath, ['scripts/harvest-classes.mjs'], { stdio: 'inherit' })
}
const harvested = JSON.parse(readFileSync('scripts/.classes.json', 'utf8'))

/* harvest-classes.mjs deliberately skips template literals: rendering both
   branches of a ternary at once produces class combinations that never co-occur
   and invents failures. But skipping them entirely hides real ones — every
   approve/reject toggle, every stage chip and every chat bubble in this app is
   written that way, and `bg-yellow-500 text-white` only ever appears inside a
   ternary. So take the branches ONE AT A TIME: each quoted alternative inside
   `${...}`, pasted onto the literal's static part, is a state the component can
   actually be in. */
const branchSources = []
const walk = d => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = `${d}/${e.name}`
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.jsx')) branchSources.push(p)
  }
}
walk('src')

const fromBranches = []
for (const file of branchSources) {
  const src = readFileSync(file, 'utf8')
  for (const m of src.matchAll(/className=\{`([^`]*)`\}/g)) {
    const lit = m[1]
    const staticPart = lit.replace(/\$\{[^}]*\}/g, ' ').replace(/\s+/g, ' ').trim()
    for (const expr of lit.matchAll(/\$\{([^}]*)\}/g)) {
      for (const q of expr[1].matchAll(/'([^']*)'|"([^"]*)"/g)) {
        const branch = (q[1] ?? q[2]).replace(/\s+/g, ' ').trim()
        if (!branch || !/text-|bg-/.test(branch)) continue
        fromBranches.push([`${staticPart} ${branch}`.trim(), file])
      }
    }
  }
}

/* White ink on an opaque fill. Hover and focus variants are left out on
   purpose — they are a pointer state, and a button has to be legible before
   anyone points at it. */
const seen = new Set()
const samples = [...harvested, ...fromBranches]
  .filter(([cls]) => /(^|\s)text-white(\s|$)/.test(cls) && /(^|\s)bg-[a-z]+-\d{3}(\s|$)/.test(cls))
  .filter(([cls]) => !seen.has(cls) && seen.add(cls))
  .map(([cls, file]) => ({
    cls, file,
    bg: cls.match(/(?:^|\s)(bg-[a-z]+-\d{3})(?:\s|$)/)[1],
    /* The hover fill, as a plain class we can render and measure. Darkening a
       resting fill to reach AA can collide it with its own hover step, and a
       button that does not change under the pointer is a regression the
       contrast number alone would report as a pass. */
    hover: (cls.match(/(?:^|\s)hover:(bg-[a-z]+-\d{3})(?:\s|$)/) || [])[1] || null,
  }))

if (!samples.length) throw new Error('button-contrast: no white-on-solid buttons harvested — the filter drifted')

const page = `<!doctype html><meta charset="utf-8"><title>button contrast</title>
<style>${css}</style>
<div class="p-4">
${samples.map((s, i) => `  <div class="${s.cls}" data-i="${i}">Save 12,500</div>`).join('\n')}
</div>
<div class="p-4">
${/* The hover fill is read from its TOKEN, not by rendering the bare class.
      Tailwind only emits the utilities the markup uses, and a fill that appears
      solely as `hover:bg-green-700` never gets a plain `.bg-green-700` rule —
      a swatch carrying that class is simply transparent, and an earlier version
      of this probe duly reported every hover state as #000000. */
  [...new Set(samples.filter(s => s.hover).map(s => s.hover))]
    .map(h => `  <div data-hover="${h}" style="background-color: var(--color-${h.slice(3)})">hover</div>`).join('\n')}
</div>
<script>
  /* Colours are normalised by PAINTING them, not by reading digits out of the
     string. Tailwind v4 emits oklch(), and getComputedStyle hands that straight
     back — so pulling the first three numbers out of "oklch(62.7% .194 33.3)"
     yields [62.7, 0.194, 33.3] and scores a mid orange as very dark blue. A 1x1
     canvas makes the browser resolve whatever syntax it is into sRGB bytes. */
  var _c = document.createElement('canvas'); _c.width = _c.height = 1;
  var _x = _c.getContext('2d', { willReadFrequently: true });
  function parse(c){
    if (!c || c === 'transparent' || c === 'none') return [0,0,0,0];
    _x.clearRect(0,0,1,1);
    /* A sentinel the stylesheet never uses: if assigning the real colour leaves
       it in place, the browser rejected the value and we would otherwise score
       a silent black. */
    _x.fillStyle = '#010203';
    _x.fillStyle = c;
    if (_x.fillStyle === '#010203') throw new Error('unresolvable colour: ' + c);
    _x.fillRect(0,0,1,1);
    var d = _x.getImageData(0,0,1,1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  }
  function over(f,b){var a=f[3];return [f[0]*a+b[0]*(1-a),f[1]*a+b[1]*(1-a),f[2]*a+b[2]*(1-a),1]}
  function lum(c){var f=function(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};
    return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2])}
  function ratio(a,b){var L=lum(a),M=lum(b);return (Math.max(L,M)+0.05)/(Math.min(L,M)+0.05)}
  function hex(c){return '#'+[c[0],c[1],c[2]].map(function(v){return Math.round(v).toString(16).padStart(2,'0')}).join('')}
  var out = [], hovers = {}, fault = null;
  try {
  document.querySelectorAll('[data-i]').forEach(function (el) {
    var cs = getComputedStyle(el);
    var bg = parse(cs.backgroundColor);
    /* A fill that is not opaque is not a solid button; it belongs to the glass
       probe, which has to composite it over a gradient. Flag rather than score. */
    if (bg[3] < 1) { out.push({ i: +el.dataset.i, translucent: true, paper: cs.backgroundColor }); return }
    var ink = over(parse(cs.color), bg);
    out.push({ i: +el.dataset.i, ink: hex(ink), paper: hex(bg), ratio: +ratio(ink, bg).toFixed(2),
               size: parseFloat(cs.fontSize), weight: cs.fontWeight });
  });
  document.querySelectorAll('[data-hover]').forEach(function (el) {
    hovers[el.dataset.hover] = hex(parse(getComputedStyle(el).backgroundColor));
  });
  } catch (e) { fault = String(e && e.message || e) }
  var j = document.createElement('pre'); j.id = 'json'; j.hidden = true;
  j.textContent = JSON.stringify({ fault: fault, rows: out, hovers: hovers });
  document.body.appendChild(j);
</scr` + `ipt>`

writeFileSync('dist/button-contrast.html', page)
const dom = execFileSync('C:/Program Files/Google/Chrome/Application/chrome.exe',
  ['--headless', '--disable-gpu', '--window-size=1200,900', '--dump-dom',
   `file:///${repo}/dist/button-contrast.html`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const jm = dom.match(/<pre id="json" hidden="">([\s\S]*?)<\/pre>/)
if (!jm) throw new Error('button-contrast: no measurements in the dumped DOM')
const parsed = JSON.parse(jm[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
if (parsed.fault) throw new Error(`button-contrast: ${parsed.fault}`)
const measured = parsed.rows
const parsedHovers = parsed.hovers || {}

/* AA: 4.5:1 for body text, 3:1 once the type is 24px, or 18.66px and bold. */
const bar = m => (m.size >= 24 || (m.size >= 18.66 && Number(m.weight) >= 700)) ? 3 : 4.5

const rows = measured.map(m => ({ ...m, ...samples[m.i], need: bar(m) }))
const failures = rows.filter(r => !r.translucent && r.ratio < r.need)

const byFill = new Map()
for (const r of rows) {
  if (r.translucent) continue
  const k = `${r.bg}  ${r.paper}`
  if (!byFill.has(k)) byFill.set(k, { pass: 0, fail: 0, ratio: r.ratio })
  byFill.get(k)[r.ratio < r.need ? 'fail' : 'pass']++
}

console.log(`${rows.length} white-on-solid button styles harvested from src/**/*.jsx\n`)
console.log('fill              paints    white     AA       styles')
for (const [k, v] of [...byFill].sort((a, b) => a[1].ratio - b[1].ratio)) {
  const [cls, paper] = k.split('  ')
  console.log(`${cls.padEnd(18)}${paper}   ${String(v.ratio).padStart(5)}:1  ` +
    `${v.ratio < 4.5 ? 'FAIL' : 'pass'}    ${v.fail} fail / ${v.pass} pass`)
}
console.log(`\n${failures.length} of ${rows.length} styles below their AA bar.`)

/* A resting fill that equals its own hover fill is a button that stops
   answering the pointer — the exact way a contrast fix goes wrong. */
const pairs = new Map()
for (const r of rows) {
  if (!r.hover || r.translucent) continue
  pairs.set(`${r.bg} -> ${r.hover}`, { rest: r.paper, over: parsedHovers[r.hover] })
}
const dead = [...pairs].filter(([, v]) => v.over && v.rest.toLowerCase() === v.over.toLowerCase())
console.log(`\nhover states`)
for (const [k, v] of pairs) {
  console.log(`  ${k.padEnd(34)}${v.rest} -> ${v.over || '(not emitted)'}` +
    (v.over && v.rest.toLowerCase() === v.over.toLowerCase() ? '   IDENTICAL' : ''))
}
if (dead.length) console.log(`\n${dead.length} hover state(s) collapsed into the resting fill.`)

if (ALL || failures.length) {
  console.log('')
  for (const r of (ALL ? rows : failures)) {
    console.log(`  ${String(r.ratio).padStart(5)}:1  need ${r.need}  ${r.file}`)
    console.log(`           ${r.cls}`)
  }
}
process.exit(failures.length || dead.length ? 1 : 0)
