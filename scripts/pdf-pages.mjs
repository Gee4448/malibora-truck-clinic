/* Dump a Chrome-generated PDF as text per page, with Y positions.
 *
 * Exists because there is no pdftoppm here and the in-app PDF viewer is an
 * embedded frame that cannot be driven. To answer "where does the page break
 * fall", read the file: Chrome subsets its fonts, so glyph codes are decoded
 * through each font's /ToUnicode CMap.
 *
 *   node scripts/pdf-pages.mjs dist/invoice-after.pdf
 */
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

const file = process.argv[2]
if (!file) throw new Error('usage: pdf-pages.mjs <file.pdf>')
const raw = readFileSync(file)
const s = raw.toString('latin1')

// --- objects -----------------------------------------------------------------
const objs = new Map()
for (const m of s.matchAll(/(\d+)\s+(\d+)\s+obj\b/g)) {
  const start = m.index + m[0].length
  const end = s.indexOf('endobj', start)
  if (end > 0) objs.set(+m[1], s.slice(start, end))
}
const streamOf = body => {
  const i = body.search(/stream\r?\n/)
  if (i < 0) return null
  const a = i + body.match(/stream\r?\n/)[0].length
  const b = body.indexOf('endstream', a)
  const buf = Buffer.from(body.slice(a, b), 'latin1')
  if (/\/FlateDecode/.test(body)) { try { return inflateSync(buf).toString('latin1') } catch { return null } }
  return buf.toString('latin1')
}

// --- ToUnicode CMaps ---------------------------------------------------------
// Maps a font resource name (/F1) to {code -> char} for the current page.
function cmapFor(objNum) {
  const body = objs.get(objNum)
  if (!body) return null
  const tu = body.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/)
  if (!tu) return null
  const cm = streamOf(objs.get(+tu[1]) || '')
  if (!cm) return null
  const map = new Map()
  for (const blk of cm.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const p of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g))
      map.set(parseInt(p[1], 16), String.fromCharCode(parseInt(p[2].slice(0, 4), 16)))
  for (const blk of cm.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
    for (const p of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      const lo = parseInt(p[1], 16), hi = parseInt(p[2], 16), dst = parseInt(p[3].slice(0, 4), 16)
      for (let c = lo; c <= hi; c++) map.set(c, String.fromCharCode(dst + c - lo))
    }
  return map
}

// --- pages -------------------------------------------------------------------
const pages = []
for (const [num, body] of objs)
  if (/\/Type\s*\/Page[^s]/.test(body)) pages.push({ num, body })
pages.sort((a, b) => a.num - b.num)

for (const [i, pg] of pages.entries()) {
  const contentRef = pg.body.match(/\/Contents\s+(\d+)\s+\d+\s+R/)
  const content = contentRef ? streamOf(objs.get(+contentRef[1]) || '') : null
  const media = pg.body.match(/\/MediaBox\s*\[([^\]]+)\]/)
  const H = media ? parseFloat(media[1].trim().split(/\s+/)[3]) : 792

  // font name -> cmap, from this page's /Resources /Font dict
  const fonts = new Map()
  const resRef = pg.body.match(/\/Resources\s+(\d+)\s+\d+\s+R/)
  const res = resRef ? objs.get(+resRef[1]) : pg.body
  const fdict = (res || '').match(/\/Font\s*<<([^>]*)>>/)
  if (fdict) for (const f of fdict[1].matchAll(/\/([A-Za-z0-9]+)\s+(\d+)\s+\d+\s+R/g)) fonts.set(f[1], cmapFor(+f[2]))

  console.log(`\n===== PAGE ${i + 1} / ${pages.length}  (height ${H}pt) =====`)
  if (!content) { console.log('  (no content stream)'); continue }

  /* Chrome draws one glyph per Tj as a hex string, positioning with a flipped
     text matrix (`1 0 0 -1 0 24 Tm`), so the Tm f-component is already the
     distance DOWN from the page top. Td moves relative to that. */
  let cm = null, y = 0, lines = new Map()
  const tok = /\/([A-Za-z0-9]+)\s+[\d.]+\s+Tf|([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+Tm|([-\d.]+)\s+([-\d.]+)\s+Td|<([0-9A-Fa-f]*)>\s*Tj|\(((?:\\.|[^)\\])*)\)\s*Tj|\[((?:\\.|[^\]])*)\]\s*TJ/g
  const decodeHex = h => { let t = ''; for (let k = 0; k + 3 < h.length + 1; k += 4) { const c = parseInt(h.slice(k, k + 4), 16); t += (cm ? cm.get(c) : null) ?? '' } return t }
  for (const m of content.matchAll(tok)) {
    if (m[1]) { cm = fonts.get(m[1]) || null; continue }
    if (m[7] !== undefined) { y = parseFloat(m[7]); continue }          // Tm
    if (m[9] !== undefined) { y += parseFloat(m[9]); continue }         // Td (ty)
    let txt = ''
    if (m[10] !== undefined) txt = decodeHex(m[10])
    else if (m[11] !== undefined) txt = m[11]
    else if (m[12] !== undefined) for (const h of m[12].matchAll(/<([0-9A-Fa-f]*)>/g)) txt += decodeHex(h[1])
    if (!txt) continue
    const key = Math.round(y)
    lines.set(key, (lines.get(key) || '') + txt)
  }
  const sorted = [...lines.entries()].sort((a, b) => a[0] - b[0])
  console.log(`  ${sorted.length} text lines; topmost ink ${sorted.length ? sorted[0][0] : '?'}pt from page top`)
  for (const [yy, t] of sorted) console.log(`  y=${String(yy).padStart(4)}  ${t.replace(/\s+/g, ' ').trim().slice(0, 96)}`)
}
