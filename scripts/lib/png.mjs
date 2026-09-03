/* Minimal PNG reader + WCAG helpers, shared by the pixel-sampling probes.
 *
 * There is no image library in this project and none is worth adding for this:
 * the probes only ever read 8-bit RGB/RGBA screenshots that Chrome just wrote.
 * Extracted from glass-probe.mjs when hero-probe.mjs needed the same thing --
 * two copies of a filter loop is two places for an off-by-one to hide.
 */
import { inflateSync } from 'node:zlib'

export function decodePNG(buf) {
  let p = 8, w = 0, h = 0, depth = 0, type = 0
  const idat = []
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), tag = buf.toString('latin1', p + 4, p + 8)
    const data = buf.subarray(p + 8, p + 8 + len)
    if (tag === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9] }
    else if (tag === 'IDAT') idat.push(data)
    else if (tag === 'IEND') break
    p += 12 + len
  }
  if (depth !== 8 || (type !== 2 && type !== 6)) throw new Error(`unsupported PNG: depth ${depth} type ${type}`)
  const ch = type === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * ch
  const out = Buffer.alloc(h * stride)
  const paeth = (a, b, c) => {
    const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c)
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
  }
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? out[y * stride + i - ch] : 0
      const b = y > 0 ? out[(y - 1) * stride + i] : 0
      const c = i >= ch && y > 0 ? out[(y - 1) * stride + i - ch] : 0
      let v = line[i]
      if (f === 1) v += a; else if (f === 2) v += b
      else if (f === 3) v += (a + b) >> 1; else if (f === 4) v += paeth(a, b, c)
      out[y * stride + i] = v & 0xff
    }
  }
  return { w, h, ch, px: out }
}

export const lum = (r, g, b) => {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
export const ratio = (L, M) => (Math.max(L, M) + 0.05) / (Math.min(L, M) + 0.05)
export const hex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')

/* Worst case for LIGHT ink is the lightest pixel it sits on. Averages lie:
   they pass while the one corner nearest a bloom fails. */
export function worstIn(img, x0, y0, w, h) {
  let best = -1, bp = [0, 0, 0], sum = [0, 0, 0], n = 0
  for (let y = Math.max(0, y0); y < Math.min(img.h, y0 + h); y++) {
    for (let x = Math.max(0, x0); x < Math.min(img.w, x0 + w); x++) {
      const i = (y * img.w + x) * img.ch
      const r = img.px[i], g = img.px[i + 1], b = img.px[i + 2]
      const L = lum(r, g, b)
      sum[0] += r; sum[1] += g; sum[2] += b; n++
      if (L > best) { best = L; bp = [r, g, b] }
    }
  }
  return { worst: bp, worstL: best, avg: sum.map(v => v / n), n }
}
