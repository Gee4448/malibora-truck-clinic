/* Measures every button and link in the app against a 44x44 hit area.
 *
 *   node scripts/tap-targets.mjs            # under-size targets only
 *   node scripts/tap-targets.mjs --all      # every control measured
 *
 * Antony's people use this on phones in a workshop, often one-handed and often
 * with gloves on, so 44px is the bar here rather than WCAG 2.5.8's 24px floor.
 *
 * Class strings are HARVESTED from src/**\/*.jsx — including the branches of
 * ternaries, which is where a lot of this app's controls live — and rendered
 * with the real built CSS. What that catches is everything whose size comes
 * from its own padding, font size and icon, which is nearly all of them. What
 * it cannot see is a control sized by its parent (a flex child that stretches,
 * a grid cell): those measure here at their natural size, so this is a floor,
 * not a certificate. Heights are the reliable half; widths depend on the label,
 * so a sample label is used and width is reported for context rather than
 * failed on unless the control has no text at all (an icon button, where the
 * measurement IS the real one).
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const ALL = process.argv.includes('--all')
const MIN = 44
const repo = process.cwd().replace(/\\/g, '/')
const css = readFileSync('dist/assets/' + readdirSync('dist/assets').find(f => f.endsWith('.css')), 'utf8')

const files = []
const walk = d => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = `${d}/${e.name}`
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.jsx')) files.push(p)
  }
}
walk('src')

/* One entry per (tag, class string) — the same string renders identically
   wherever it appears, so there is no point measuring it twice. But EVERY file
   it appears in is recorded against that entry. Reporting only the first was a
   real defect and not a cosmetic one: `p-1 rounded hover:bg-gray-100` is the
   modal close button on fifteen screens, the report named one of them, and
   fixing that one left fourteen identical controls untouched while the count
   went down as if they were done. */
const byKey = new Map()
const controls = []
const add = (tag, cls, file, iconOnly) => {
  if (!cls) return
  const key = `${tag}|${cls}`
  const existing = byKey.get(key)
  if (existing) { existing.files.add(file); return }
  const entry = { tag, cls, files: new Set([file]), iconOnly }
  byKey.set(key, entry)
  controls.push(entry)
}

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  // The opening tag plus everything up to the matching close, so the body can
  // be inspected for whether the control carries any text of its own.
  for (const m of src.matchAll(/<(button|Link|a|NavLink)\b([\s\S]*?)>([\s\S]*?)<\/\1>/g)) {
    const [, tag, attrs, body] = m
    const literal = attrs.match(/className="([^"{}]+)"/)
    const template = attrs.match(/className=\{`([^`]*)`\}/)
    /* Whether the control carries a visible LABEL, which decides whether its
       measured width means anything. Stripping `{...}` along with the tags was
       wrong: nearly every label in this app is `{t('some.key')}`, so that
       counted the sidebar's "Log out" and half the app's primary buttons as
       icon-only and failed them on a width their real text would fill. An
       expression that is not obviously an icon is treated as a label. */
    const stripped = body.replace(/<[^>]*>/g, '')
    const hasLabel = /\{\s*t\(/.test(stripped)          // {t('key')}
      || /[A-Za-z0-9]/.test(stripped.replace(/\{[^}]*\}/g, ''))   // literal text
      || /\{[^}]*\b(name|title|label|text|count|full_name)\b[^}]*\}/i.test(stripped)
    const iconOnly = !hasLabel

    if (literal) add(tag, literal[1].replace(/\s+/g, ' ').trim(), file, iconOnly)
    if (template) {
      const staticPart = template[1].replace(/\$\{[^}]*\}/g, ' ').replace(/\s+/g, ' ').trim()
      let any = false
      for (const expr of template[1].matchAll(/\$\{([^}]*)\}/g)) {
        for (const q of expr[1].matchAll(/'([^']*)'|"([^"]*)"/g)) {
          const branch = (q[1] ?? q[2]).replace(/\s+/g, ' ').trim()
          if (!branch) continue
          any = true
          add(tag, `${staticPart} ${branch}`.trim(), file, iconOnly)
        }
      }
      if (!any && staticPart) add(tag, staticPart, file, iconOnly)
    }
  }
}

if (!controls.length) throw new Error('tap-targets: harvested nothing — the scan drifted')

// A 16px square stands in for the lucide icons these controls carry. Lucide
// renders an <svg> sized by the width and height utilities in the markup, and
// the harvested class string already carries those.
const sample = c => c.iconOnly
  ? '<svg width="16" height="16"></svg>'
  : '<svg width="16" height="16"></svg>Save'

/* Rendered at a phone viewport on purpose. index.css already carries a
   `button:not(.btn-compact) { min-height: … }` rule under `max-width: 767px`,
   so measuring at desktop width would report heights no phone ever shows —
   and would hide the fact that the rule does not reach plain <a> links. */
const page = `<!doctype html><meta charset="utf-8"><title>tap targets</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style>
<div class="p-4" style="width:375px">
${controls.map((c, i) => `  <${c.tag === 'button' ? 'button' : 'a'} class="${c.cls}" data-i="${i}">${sample(c)}</${c.tag === 'button' ? 'button' : 'a'}>`).join('\n')}
</div>
<script>
  var out = [];
  document.querySelectorAll('[data-i]').forEach(function (el) {
    var r = el.getBoundingClientRect();
    out.push({ i: +el.dataset.i, w: Math.round(r.width), h: Math.round(r.height) });
  });
  var j = document.createElement('pre'); j.id = 'json'; j.hidden = true;
  j.textContent = JSON.stringify(out);
  document.body.appendChild(j);
</scr` + `ipt>`

writeFileSync('dist/tap-targets.html', page)
const dom = execFileSync('C:/Program Files/Google/Chrome/Application/chrome.exe',
  ['--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
   '--window-size=520,900', '--dump-dom', `file:///${repo}/dist/tap-targets.html`],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const jm = dom.match(/<pre id="json" hidden="">([\s\S]*?)<\/pre>/)
if (!jm) throw new Error('tap-targets: no measurements in the dumped DOM')

const rows = JSON.parse(jm[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
  .map(m => ({ ...m, ...controls[m.i] }))
  .filter(r => r.w > 0 && r.h > 0)

/* A `.tap` element carries a pseudo-element hit area, so its own box being
   small is the point rather than a defect. */
const exempt = r => /(^|\s)tap(\s|$)/.test(r.cls)

/* A control whose width is decided by its parent cannot be measured here at
   all — rendered alone, `flex-1` collapses to its content and reports 16px.
   Those were being failed on a width they never have: the mechanic keypad's
   digits are `py-4 flex-1` in a three-column grid and are ~100px wide in situ.
   Height is still checked, because that these DO own. */
const parentSized = r => /(^|\s)(flex-1|grow|w-full|basis-\S+|col-span-\S+)(\s|$)/.test(r.cls)
const short = rows.filter(r =>
  !exempt(r) && (r.h < MIN || (r.iconOnly && !parentSized(r) && r.w < MIN)))

const byFile = new Map()
for (const r of short) for (const f of r.files) byFile.set(f, (byFile.get(f) || 0) + 1)

console.log(`${rows.length} distinct controls measured at 375px, ${rows.filter(exempt).length} already carrying .tap\n`)
for (const r of (ALL ? rows : short)) {
  const where = [...r.files]
  console.log(`  ${String(r.h).padStart(3)}px high ${String(r.w).padStart(4)}px wide  ${r.tag.padEnd(7)} ${r.iconOnly ? 'icon-only' : '         '}  ${where[0]}${where.length > 1 ? `  (+${where.length - 1} more file${where.length > 2 ? 's' : ''})` : ''}`)
  for (const extra of where.slice(1)) console.log(`        also ${extra}`)
  // Printed whole, never truncated: these strings get copied out of this
  // report into a patch, and a silently clipped one does not match anything.
  console.log(`      ${r.cls}`)
}
console.log(`\n${short.length} control style${short.length === 1 ? '' : 's'} under ${MIN}px`)
for (const [f, n] of [...byFile].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${f}`)
process.exit(short.length ? 1 : 0)
