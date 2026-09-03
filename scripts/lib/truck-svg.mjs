/* Turns src/components/common/TruckMark.jsx into standalone SVG markup.
 *
 * The probes render the REAL component source rather than a retyped copy —
 * a harness that retypes the thing it is checking is checking the copy. This
 * only works because TruckMark is deliberately plain JSX: no map(), no
 * conditionals, no interpolated numbers. If that ever stops being true, this
 * throws rather than silently rendering a truck missing its wheels.
 */
import { readFileSync } from 'node:fs'

export function truckSVG(className = '') {
  const src = readFileSync('src/components/common/TruckMark.jsx', 'utf8')
  const start = src.indexOf('<svg')
  if (start < 0) throw new Error('TruckMark.jsx: no <svg> found')
  let svg = src.slice(start).replace(/\s*\)\s*\}\s*$/, '')

  svg = svg
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')                       // JSX comments
    .replace(/className=\{`([^`]*)\$\{className\}`\}/, (_, base) => `class="${base}${className}"`)
    .replace(/\bstrokeWidth=/g, 'stroke-width=')
    .replace(/\bstrokeLinecap=/g, 'stroke-linecap=')
    .replace(/\bstrokeLinejoin=/g, 'stroke-linejoin=')
    .replace(/\bclipPath=/g, 'clip-path=')

  const leftover = svg.match(/\{[^}]*\}/)
  if (leftover) throw new Error(`TruckMark.jsx has JSX this converter cannot resolve: ${leftover[0].slice(0, 60)}`)
  return svg
}
