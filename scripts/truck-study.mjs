/* Renders TruckMark large, on the app's own ground, so the DRAWING can be
 * judged. In the hero it ships at ~350px wide, where a wrong line just looks
 * like a smudge; at 900px every join is visible.
 *
 *   node scripts/truck-study.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { truckSVG } from './lib/truck-svg.mjs'

const repo = process.cwd().replace(/\\/g, '/')
const css = readFileSync('dist/assets/' + readdirSync('dist/assets').find(f => f.endsWith('.css')), 'utf8')

writeFileSync('dist/truck-study.html', `<!doctype html><meta charset="utf-8">
<title>truck study</title><style>${css}</style>
<div class="min-h-screen p-8">
  <div class="max-w-5xl mx-auto space-y-8">
    <div class="text-white/90">${truckSVG(' w-full')}</div>
    <div class="hero-dark rounded-3xl p-6 h-[176px] flex flex-col justify-end">
      <div class="text-white opacity-65 absolute right-4 bottom-3 h-[112px] w-auto">${truckSVG(' h-full w-auto')}</div>
      <div class="relative">
        <p class="on-dark-muted text-xs font-medium font-display tracking-wide uppercase">Thursday 3 September</p>
        <h1 class="text-2xl font-bold mt-1 leading-tight text-white">Welcome, Godson</h1>
      </div>
    </div>
  </div>
</div>`)

execFileSync('C:/Program Files/Google/Chrome/Application/chrome.exe',
  ['--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
   '--window-size=1000,700', `--screenshot=${repo}/dist/truck-study.png`,
   `file:///${repo}/dist/truck-study.html`], { stdio: 'ignore' })
console.log('rendered dist/truck-study.png')
