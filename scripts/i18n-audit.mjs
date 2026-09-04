/* What the two translation files hold that nothing renders, and what the app
 * asks for that they do not hold.
 *
 * This exists because the marketing landing page was deleted on 2 Jul 2026 and
 * its copy was not: fifty strings across en.json and sw.json for a page that
 * had no route, still shipping in the bundle two months later. Nothing would
 * ever have told us — a missing key shows up the moment someone opens the
 * screen, but a surplus key is silent forever.
 *
 * Dynamic keys are the reason this is not a plain grep. The app builds keys at
 * runtime in two shapes:
 *
 *     t(`staffAdmin.roles.${r}`)      -> a literal prefix, then a variable
 *     t(`jobs.status.${s}.label`)     -> a variable in the middle
 *
 * Both are recorded as PREFIXES, and every key underneath a live prefix counts
 * as used. That is deliberately generous: this script's job is to find dead
 * weight without ever tempting anyone to delete a key that a template literal
 * reaches. Anything it lists is safe to look at by hand; nothing it omits is a
 * problem.
 *
 * Run: node scripts/i18n-audit.mjs        (exits 1 if a key is MISSING)
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, extname } from 'node:path'

const LOCALES = ['src/i18n/en.json', 'src/i18n/sw.json']
const SOURCE_DIR = 'src'

const flatten = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]
  )

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name)
    if (e.isDirectory()) return sourceFiles(full)
    return ['.js', '.jsx'].includes(extname(e.name)) ? [full] : []
  })
}

const literal = new Set()   // t('a.b.c')
const quoted = new Set()    // 'a.b.c' anywhere — see below
const prefixes = new Set()  // t(`a.b.${x}`)
const computed = []         // t(someVariable) — unauditable, so reported

// Comments are not code. The first run of this script reported
// `a.b.c` MISSING because LanguageContext.jsx documents the call shape in a
// comment; a doc example is not a call site.
const decomment = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

for (const file of sourceFiles(SOURCE_DIR)) {
  const src = decomment(readFileSync(file, 'utf8'))

  for (const m of src.matchAll(/\bt\(\s*['"]([\w.]+)['"]/g)) literal.add(m[1])

  // The literal head of a template key always ends at the first interpolation.
  // A head of `a.b.` puts every key under a.b in play.
  for (const m of src.matchAll(/\bt\(\s*`([^`$]*)\$\{/g)) {
    const head = m[1]
    if (head.includes('.')) prefixes.add(head.slice(0, head.lastIndexOf('.') + 1))
  }

  for (const m of src.matchAll(/\bt\(\s*([A-Za-z_$][\w.$]*)\s*[,)]/g)) computed.push(`${file}: t(${m[1]})`)

  // Any dotted string ANYWHERE, not just inside t(). Keys reach the translator
  // through config objects too — company.js stores `roleKey: 'company.garage'`
  // and Settings.jsx calls t(loc.roleKey), so a t()-only scan called all four
  // company.* keys dead while the Settings panel was rendering them.
  for (const m of src.matchAll(/['"]([a-z][\w]*(?:\.[\w]+)+)['"]/gi)) quoted.add(m[1])
}

const covered = (key) =>
  literal.has(key) || quoted.has(key) || [...prefixes].some((p) => key.startsWith(p))

let missing = 0
for (const file of LOCALES) {
  const keys = new Set(flatten(JSON.parse(readFileSync(file, 'utf8'))))
  const unused = [...keys].filter((k) => !covered(k)).sort()
  const absent = [...literal].filter((k) => !keys.has(k)).sort()

  console.log(`\n${file} — ${keys.size} keys`)
  console.log(`  unused: ${unused.length}`)
  for (const k of unused) console.log(`    - ${k}`)
  if (absent.length) {
    console.log(`  MISSING (the app asks for these and they are not here): ${absent.length}`)
    for (const k of absent) console.log(`    ! ${k}`)
    missing += absent.length
  }
}

console.log(`\nliteral keys in source: ${literal.size}; dynamic prefixes: ${[...prefixes].sort().join(', ') || 'none'}`)
if (computed.length) {
  console.log(`\nkeys built from a variable — the "unused" list above is advisory while any of these exist:`)
  for (const c of computed) console.log(`  ${c}`)
}
process.exit(missing ? 1 : 0)
