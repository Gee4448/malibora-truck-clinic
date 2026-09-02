// Harvests every static className string in the app. Not shipped — dev tool.
//
//   node scripts/harvest-classes.mjs      -> writes scripts/.classes.json
//
// This exists because of a specific, awkward constraint: nearly every screen in
// this app is behind a Supabase login, and there is no session available
// locally, so the contrast probe can only ever be pointed at the four public
// auth routes. That leaves ~50 screens — every dashboard, table, invoice and
// job card — measured by nothing at all.
//
// The way round it is to bring the markup to the probe instead of navigating to
// it. Harvest the class strings, render all of them inside a real card, and run
// contrast-audit.js over the result. It is not a substitute for seeing the real
// screens with real data — layout, truncation and overflow are all invisible to
// it — but for COLOUR it is strictly better than spot-checking, because it
// covers every combination the codebase actually contains rather than the few
// that happen to be on screen.
//
// In the browser, with `npm run dev` running:
//
//   const list = await (await fetch('/@fs/<abs repo path>/scripts/.classes.json')).json()
//   const lab = document.createElement('div')
//   lab.innerHTML = '<div class="bg-white rounded-2xl p-4">' +
//     list.map(([c], i) => `<div class="${c}" data-i="${i}">Sample 12,500</div>`).join('') + '</div>'
//   document.body.appendChild(lab)
//   // ...then eval contrast-audit.js
//
// It found six live defects on the dark rebuild that reading the CSS had
// missed, including `text-purple-900` at 1.24:1 and `text-orange-900` at 1.45:1
// — near-black ink left sitting on a near-black card.

import fs from 'fs'
import path from 'path'

const files = []
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
  const p = path.join(d, e.name)
  if (e.isDirectory()) walk(p)
  else if (e.name.endsWith('.jsx')) files.push(p)
})
walk('src')

const set = new Map()
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  // Only static className string literals. Template literals with ${} are
  // conditional, and rendering both branches at once would produce class
  // combinations that never actually co-occur — false failures.
  for (const m of src.matchAll(/className="([^"{}]+)"/g)) {
    const cls = m[1].replace(/\s+/g, ' ').trim()
    if (!/text-|bg-|border-|divide-/.test(cls)) continue
    if (!set.has(cls)) set.set(cls, f.split(path.sep).join('/'))
  }
}
console.log('jsx files:', files.length, '| unique styled class strings:', set.size)
fs.writeFileSync('scripts/.classes.json', JSON.stringify([...set]))
console.log('written to scripts/.classes.json')
