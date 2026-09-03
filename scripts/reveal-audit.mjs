/* Checks the scroll-reveal wiring across the app.
 *
 *   node scripts/reveal-audit.mjs
 *
 * There is one failure mode here that is worse than no animation at all:
 * `.reveal` sets `opacity: 0` and only `.is-visible` brings it back, and
 * `.is-visible` is added by the IntersectionObserver inside useReveal(). So a
 * `reveal` class on an element that is NOT observed — because the ref was
 * forgotten, or renamed, or attached to the wrong node — is invisible content,
 * permanently, with no error anywhere. That is what this audit is for.
 *
 * It also lists which page components have no entrance motion at all, which is
 * how the nine screens that had none were found in the first place.
 */
import { readFileSync, readdirSync } from 'node:fs'

const pages = []
const walk = d => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = `${d}/${e.name}`
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.jsx')) pages.push(p)
  }
}
walk('src')

let dangling = 0, covered = 0
const bare = []

for (const file of pages) {
  const src = readFileSync(file, 'utf8')

  /* Every element carrying a reveal class in a static className. <Reveal> adds
     the class and the ref together, so it is safe by construction and only
     hand-attached ones are checked here. */
  for (const m of src.matchAll(/<(\w+)([^>]*className="(?:[^"]*\s)?reveal(?:-group)?(?:\s[^"]*)?"[^>]*)>/g)) {
    const attrs = m[2]
    if (!/\bref=\{/.test(attrs)) {
      dangling++
      console.log(`DANGLING  ${file}`)
      console.log(`          <${m[1]} ...> carries a reveal class with no ref — it will never become visible`)
    }
  }

  if (!/^src\/pages\//.test(file)) continue
  const hasMotion = /<Reveal\b|useReveal\(|animate-(fade|scale|pop|float|slide)/.test(src)
  if (hasMotion) covered++
  else bare.push(file)
}

const pageFiles = pages.filter(f => /^src\/pages\//.test(f))
console.log(`\n${covered} of ${pageFiles.length} page components have entrance motion`)
if (bare.length) {
  console.log('\nno entrance motion:')
  for (const f of bare) console.log(`  ${f}`)
}
console.log(`\n${dangling} dangling reveal${dangling === 1 ? '' : 's'}`)
process.exit(dangling ? 1 : 0)
