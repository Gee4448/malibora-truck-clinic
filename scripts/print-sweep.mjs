/* Sweep invoice lengths and report, for each, which printed page every part of
 * the totals block and the footer lands on. A totals block split across a page
 * boundary -- TOTAL on its own sheet, away from the subtotals it sums -- is an
 * invoice defect, and whether it happens depends entirely on row count, so a
 * single sample proves nothing.
 *
 *   node scripts/print-sweep.mjs 36 64
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const from = Number(process.argv[2] || 36), to = Number(process.argv[3] || 64)
const repo = process.cwd().replace(/\\/g, '/')

/* Anchors come from the shipped translations. Hand-written ones drifted: this
   swept for "Subtotal Parts" and "Payment due" against a document that says
   "Parts Subtotal" and thanks you for your business, so two of the four columns
   were reporting p? and 'ok' on strings that were never on the page. Anything
   that fails to match now throws instead of printing a question mark. */
const inv = JSON.parse(readFileSync('src/i18n/en.json', 'utf8')).invoices
const rx = t => new RegExp(String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

const WANT = [
  ['parts sub', rx(inv.subtotalParts)],
  /* No parenthesis: the extractor drops '(18%)' into its own run, so the
     line reads 'VAT 18%'. */
  ['vat', rx(inv.vat)],
  ['total', rx(inv.total)],
  ['paid', rx(inv.paidOn)],
  ['footer', /Asante kwa kuchagua/],
]

console.log('rows  pages | ' + WANT.map(w => w[0]).join('  ') + '   verdict')
for (let n = from; n <= to; n++) {
  execFileSync(process.execPath, ['scripts/print-proof.mjs', 'dist/sweep.html', '--raw', `--rows=${n}`], { stdio: 'ignore' })
  execFileSync(CHROME, ['--headless', '--disable-gpu', '--no-pdf-header-footer',
    `--print-to-pdf=${repo}/dist/sweep.pdf`, `file:///${repo}/dist/sweep.html`], { stdio: 'ignore' })
  const dump = execFileSync(process.execPath, ['scripts/pdf-pages.mjs', 'dist/sweep.pdf'], { encoding: 'utf8' })

  let page = 0, total = 0
  const at = {}
  for (const l of dump.split('\n')) {
    const m = l.match(/=====\s+PAGE\s+(\d+)\s*\/\s*(\d+)/)
    if (m) { page = +m[1]; total = +m[2]; continue }
    if (!/^\s*y=/.test(l)) continue
    for (const [name, re] of WANT) if (at[name] === undefined && re.test(l)) at[name] = page
  }
  const missing = WANT.map(w => w[0]).filter(n => at[n] === undefined)
  if (missing.length) throw new Error(`print-sweep: never found ${missing.join(', ')} in the PDF — the document moved`)
  const tailPages = new Set(WANT.map(w => at[w[0]]))
  tailPages.delete(undefined)
  const verdict = tailPages.size > 1 ? 'TAIL SPLIT' : 'ok'
  console.log(
    String(n).padStart(4), String(total).padStart(5), '  |  ' +
    WANT.map(w => `p${at[w[0]] ?? '?'}`).join('    ') + '    ' + verdict)
}
