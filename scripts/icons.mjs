/* Regenerate the app icons from the one real logo file.
 *
 * The one real defect this fixes:
 *
 *   Both sizes were declared `purpose: "any maskable"`. Those are two different
 *   pictures. Android crops a maskable icon to whatever shape the launcher
 *   uses, and only the centred circle of 80% diameter is guaranteed to survive;
 *   an `any` icon is shown whole and wants to fill its frame. Declaring one
 *   file as both means it is drawn at maskable's conservative size everywhere
 *   it is NOT cropped. They are now generated separately, and the maskable
 *   share is computed from the safe zone rather than guessed at.
 *
 * Three things I went in believing, which were not true — recorded because the
 * next person will believe them too:
 *
 *   * "The icons are on the old #F58220." They are not. #F58220 was an
 *     eyeballed approximation of the logo in the very first recolor commit and
 *     survives nowhere in the repo. The icons carry #f27920, which is what the
 *     logo file itself is.
 *
 *   * "The monogram is clipped — 94x75 out of 94x84." It is not. 84px is the
 *     height of the thin orange RULE between monogram and wordmark, which a
 *     bounding box over all orange pixels silently includes. The monogram is
 *     94x75 and the old crop was centred correctly.
 *
 *   * "The plate should be dark, to match the app." It should not. The mark is
 *     a KNOCKOUT: an orange field with the arch carved out of it, so its shape
 *     is drawn by the ground showing through. Put it on #0b0705 and the arch
 *     stops reading — you get an orange tile with dark marks in it. The plate
 *     stays light for the same reason the logo's own does.
 *
 * The mark keeps its own orange, sampled from the file. Note that the palette
 * sheet's --brand-orange is #e85002 and the app chrome uses that: the client's
 * logo file and the client's palette sheet do not agree with each other, and
 * repainting a company's mark is not a decision for a build script.
 *
 * Run: node scripts/icons.mjs
 */
import sharp from 'sharp'
import { writeFileSync } from 'node:fs'

const SOURCE = 'public/malibora-logo.png'

// Light, because the mark is a knockout (see the header). Not pure white: this
// is --brand-white from the palette, the same off-white the app's ink sits on.
// It is deliberately NOT manifest.background_color — that is the splash screen,
// which is dark on purpose, and the two are allowed to differ.
const GROUND = '#f9f9f9'

/** Is this pixel part of the orange mark? Red-dominant and clearly chromatic. */
const isMark = (r, g, b, a) => a >= 128 && r > 180 && g > 90 && g < 190 && b < 110 && r - b > 90

/**
 * Find the monogram in the logo lockup.
 *
 * The lockup is [monogram] [thin rule] [wordmark]. Only the monogram and the
 * rule are orange, so scanning for orange finds both — and the rule is a
 * 2px-wide column separated from the monogram by a gap of clear space. Split
 * on that gap and keep the first, wide group.
 */
async function findMark() {
  const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H, channels: C } = info

  // Column-major on purpose: the question is 'does this COLUMN contain any
  // mark pixel', so x has to be the outer loop for the break to mean that.
  const columnHasMark = new Array(W).fill(false)
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      const i = (y * W + x) * C
      if (isMark(data[i], data[i + 1], data[i + 2], data[i + 3])) { columnHasMark[x] = true; break }
    }
  }

  const groups = []
  for (let x = 0; x < W; x++) {
    if (!columnHasMark[x]) continue
    const last = groups[groups.length - 1]
    if (last && x - last.x1 <= 2) last.x1 = x
    else groups.push({ x0: x, x1: x })
  }
  if (groups.length === 0) throw new Error(`no orange found in ${SOURCE} — has the logo been replaced?`)

  const mark = groups[0]
  const width = mark.x1 - mark.x0 + 1
  if (width < 40) throw new Error(`first orange group in ${SOURCE} is only ${width}px wide — that is the rule, not the monogram`)

  let y0 = Infinity, y1 = -1
  for (let y = 0; y < H; y++) {
    for (let x = mark.x0; x <= mark.x1; x++) {
      const i = (y * W + x) * C
      if (isMark(data[i], data[i + 1], data[i + 2], data[i + 3])) { if (y < y0) y0 = y; if (y > y1) y1 = y; break }
    }
  }

  const box = { left: mark.x0, top: y0, width, height: y1 - y0 + 1 }
  // The monogram is a broad, squat shape. If a future logo drop makes this
  // scan return a tall thin thing, it has locked onto the wrong element and
  // the icons would be silently wrong again.
  const ratio = box.width / box.height
  if (ratio < 0.8 || ratio > 2) throw new Error(`monogram looks wrong: ${box.width}x${box.height} (aspect ${ratio.toFixed(2)})`)
  return box
}

/**
 * The monogram on transparency.
 *
 * The mark is one flat orange on pure white, so the blue channel alone is a
 * clean alpha: white is 255, the orange is 32, and an anti-aliased edge lands
 * proportionally between them. Taking alpha from a channel rather than
 * thresholding is what keeps the curve edges smooth at 512px.
 */
async function cutout(box) {
  const { data, info } = await sharp(SOURCE).ensureAlpha().extract(box).raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H, channels: C } = info
  const out = Buffer.alloc(W * H * 4)

  // The ink colour, sampled from the logo rather than typed in — the MODE of
  // the mark's pixels, not its most saturated one. A single extreme pixel is a
  // compression artefact: taking it gave #f16c0d, six steps off the #f27920
  // that 6% of the mark actually is.
  const tally = new Map()
  for (let i = 0; i < data.length; i += C) {
    if (!isMark(data[i], data[i + 1], data[i + 2], data[i + 3])) continue
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]
    tally.set(key, (tally.get(key) || 0) + 1)
  }
  if (tally.size === 0) throw new Error('no mark pixels inside the crop')
  const key = [...tally].sort((x, y) => y[1] - x[1])[0][0]
  const ink = [(key >> 16) & 255, (key >> 8) & 255, key & 255]
  const bluest = ink[2]

  for (let p = 0, q = 0; p < data.length; p += C, q += 4) {
    const alpha = Math.max(0, Math.min(255, Math.round(((255 - data[p + 2]) / (255 - bluest)) * 255)))
    out[q] = ink[0]; out[q + 1] = ink[1]; out[q + 2] = ink[2]; out[q + 3] = alpha
  }
  return { buffer: out, width: W, height: H, ink }
}

/** A rounded-rect plate, or a plain square when radius is 0. */
const plate = (size, radius) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${GROUND}"/></svg>`
  )

/**
 * @param size      canvas edge, px
 * @param markShare how much of the canvas edge the mark's WIDTH takes
 * @param radius    corner radius, px (0 for full bleed)
 */
async function compose(mark, size, markShare, radius) {
  const w = Math.round(size * markShare)
  const h = Math.round((w * mark.height) / mark.width)
  const scaled = await sharp(mark.buffer, { raw: { width: mark.width, height: mark.height, channels: 4 } })
    .resize(w, h, { fit: 'fill' })
    .png()
    .toBuffer()
  return sharp(plate(size, radius))
    .composite([{ input: scaled, left: Math.round((size - w) / 2), top: Math.round((size - h) / 2) }])
    .png({ compressionLevel: 9 })
    .toBuffer()
}

/**
 * How wide the mark may be inside a maskable icon's safe zone.
 *
 * The spec guarantees only a centred circle of 80% of the canvas. The corners
 * of the mark's box are its furthest points, so its DIAGONAL is what has to fit
 * inside that circle — then take 90% of that for breathing room.
 */
function maskableShare(mark) {
  const diagonalShare = 0.8
  const byDiagonal = (diagonalShare * mark.width) / Math.hypot(mark.width, mark.height)
  return byDiagonal * 0.9
}

const run = async () => {
  const box = await findMark()
  const mark = await cutout(box)
  console.log(`monogram found at ${box.left},${box.top} — ${box.width}x${box.height}, ink #${mark.ink.map(v => v.toString(16).padStart(2, '0')).join('')}`)
  console.log(`ground ${GROUND}`)

  const share = maskableShare(mark)
  const jobs = [
    // Shown whole: a rounded plate, mark filling the frame.
    ['public/icons/icon-192.png', 192, 0.62, 192 * 0.22],
    ['public/icons/icon-512.png', 512, 0.62, 512 * 0.22],
    // Cropped by the launcher to an unknown shape: full bleed, mark inside the
    // safe circle.
    ['public/icons/icon-maskable-192.png', 192, share, 0],
    ['public/icons/icon-maskable-512.png', 512, share, 0],
    // iOS rounds the corners itself and ignores transparency.
    ['public/icons/apple-touch-icon.png', 180, 0.62, 0],
  ]

  for (const [file, size, s, radius] of jobs) {
    writeFileSync(file, await compose(mark, size, s, radius))
    console.log(`  ${file}  ${size}px  mark ${(s * 100).toFixed(0)}% of edge`)
  }

  // The browser tab. The plate is real SVG so it stays crisp at any size; the
  // mark is embedded at its NATIVE 94x75 and left for the browser to scale.
  // Upscaling it here first only spends bytes — a 256px embed made this file
  // 64KB against 12KB, and invented no detail the source does not have. The
  // favicon is fetched on every cold load over Tanzanian mobile data.
  const embedded = await sharp(mark.buffer, { raw: { width: mark.width, height: mark.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer()
  const markH = (62 * mark.height) / mark.width
  writeFileSync(
    'public/favicon.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n` +
      `  <rect width="100" height="100" rx="22" fill="${GROUND}"/>\n` +
      `  <image x="19" y="${(50 - markH / 2).toFixed(2)}" width="62" height="${markH.toFixed(2)}" ` +
      `href="data:image/png;base64,${embedded.toString('base64')}"/>\n</svg>\n`
  )
  console.log('  public/favicon.svg')
}

run()
