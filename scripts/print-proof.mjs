/* Proof for the print path, which is otherwise unobservable from here.
 *
 * Two modes, because they answer two questions that need different rendering:
 *
 *   node scripts/print-proof.mjs out.html            COLOUR
 *     Rewrites `@media print` to `@media all` IN PLACE in the shipped CSS --
 *     same position, same specificity, so the cascade resolves exactly as a
 *     printer would -- and exposes window.__auditPrint(), which scores each
 *     element against the ground it actually composites over. Screen rendering
 *     has no pages, so this mode says nothing about fragmentation.
 *
 *   node scripts/print-proof.mjs out.html --raw      PAGINATION
 *     Leaves the CSS alone and lets a real headless Chrome apply @media print
 *     while producing a real PDF:
 *       chrome --headless --disable-gpu --no-pdf-header-footer \
 *              --print-to-pdf=out.pdf out.html
 *     This is the only way to see actual page breaks. Pair it with --rows=N to
 *     force a multi-page document.
 *
 * The markup is the printable half of src/pages/InvoiceDetail.jsx wrapped in
 * the real Layout shell (Header + Sidebar), class strings copied verbatim, so
 * the chrome is tested too -- a nav bar with no `no-print` still prints.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'

const out = process.argv[2]
if (!out) throw new Error('usage: print-proof.mjs <out.html> [--raw] [--rows=N]')
const raw = process.argv.includes('--raw')
const rows = Number((process.argv.find(a => a.startsWith('--rows=')) || '').split('=')[1]) || 1

const cssFile = readdirSync('dist/assets').find(f => f.endsWith('.css'))
let css = readFileSync(`dist/assets/${cssFile}`, 'utf8')

if (!raw) {
  const n = (css.match(/@media print\{/g) || []).length
  if (n !== 3) throw new Error(`expected 3 print blocks, found ${n}`)
  css = css.replace(/@media print\{/g, '@media all{')
}

const money = n => n.toLocaleString('en-US')
const line = (i, desc, qty, unit) => `
        <tr class="border-b border-gray-100">
          <td class="p-2.5 text-gray-500">${i}</td>
          <td class="p-2.5">${desc}</td>
          <td class="p-2.5 text-right">${qty}</td>
          <td class="p-2.5 text-right">${money(unit)}</td>
          <td class="p-2.5 text-right font-medium">${money(qty * unit)}</td>
        </tr>`

const parts = [
  'Brake pad set, front axle', 'Air filter element', 'Oil filter, spin-on',
  'Fuel filter assembly', 'Coolant hose, upper radiator', 'Wheel bearing kit, rear',
  'Clutch release bearing', 'Shock absorber, front left', 'Leaf spring bush set',
  'Alternator belt, ribbed', 'Starter motor solenoid', 'Injector seal kit',
]
const body = `
<div class="min-h-screen">
  <aside class="drawer-dark fixed top-0 left-0 h-full w-64 z-50 transform -translate-x-full flex flex-col" id="s-sidebar">
    <div class="p-4 text-white font-bold">Malibora</div>
  </aside>
  <div>
    <header class="app-bar h-16 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30" id="s-header">
      <button class="p-2 rounded-lg text-white/80">MENU</button>
      <div class="flex items-center gap-3 ml-auto">
        <span class="px-3 py-1.5 rounded-lg text-sm font-medium text-white/85 bg-white/10">EN</span>
        <span class="p-2 rounded-lg text-white/80">BELL</span>
      </div>
    </header>
    <main class="p-4 lg:p-6 animate-fade-in-up">
      <div class="max-w-3xl mx-auto space-y-4">

        <div class="flex sm:items-center sm:justify-between gap-3 no-print" id="s-actions">
          <button class="text-gray-600">Back</button>
          <button class="px-4 py-2 bg-blue-600 text-white rounded-lg">Print</button>
        </div>

        <div class="reveal bg-white rounded-2xl border border-gray-200 p-4 sm:p-8 print:border-0 print:shadow-none print:p-0" id="doc">
          <div class="flex justify-between items-start border-b-2 border-blue-700 pb-4 mb-6">
            <div>
              <h1 class="text-2xl font-bold text-blue-800">MALIBORA TRUCK CLINIC</h1>
              <p class="text-sm text-gray-500 mt-1">Professional Vehicle Service &amp; Repair</p>
              <p class="text-xs text-gray-400 mt-1">Arusha, Tanzania</p>
            </div>
            <div class="text-right">
              <h2 class="text-xl font-bold text-gray-900 uppercase" id="t-type">TAX INVOICE</h2>
              <p class="text-lg font-mono text-blue-700 mt-1" id="t-number">INV-2026-0042</p>
              <p class="text-sm text-gray-500 mt-1">2 Sep 2026</p>
              <span class="inline-block text-xs px-2.5 py-1 rounded-full font-medium mt-2 bg-green-100 text-green-700" id="t-status">Paid</span>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-6 mb-6">
            <div>
              <h3 class="text-xs font-semibold text-gray-500 uppercase mb-2" id="t-billto">BILL TO</h3>
              <p class="font-semibold text-gray-900">Antony Mushi</p>
              <p class="text-sm text-gray-600">Kilimanjaro Haulage Ltd</p>
              <p class="text-sm text-gray-600">+255 754 000 111</p>
              <p class="text-sm text-gray-600">TIN: 123-456-789</p>
            </div>
            <div>
              <h3 class="text-xs font-semibold text-gray-500 uppercase mb-2">VEHICLE</h3>
              <p class="font-semibold text-gray-900">T 123 ABC</p>
              <p class="text-sm text-gray-600">Scania R440</p>
              <p class="text-sm text-gray-600 mt-1">Job: <a class="text-blue-600" id="t-joblink">JC-2026-0311</a></p>
            </div>
          </div>

          <table class="w-full text-sm mb-6">
            <thead id="s-thead">
              <tr class="bg-blue-50 border-b-2 border-blue-200" id="t-headrow">
                <th class="text-left p-2.5 font-semibold text-blue-900" id="t-th">#</th>
                <th class="text-left p-2.5 font-semibold text-blue-900">Description</th>
                <th class="text-right p-2.5 font-semibold text-blue-900">Qty</th>
                <th class="text-right p-2.5 font-semibold text-blue-900">Unit Price</th>
                <th class="text-right p-2.5 font-semibold text-blue-900">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="5" class="p-2 font-semibold text-gray-700 bg-gray-50 border-b" id="t-section">Parts &amp; Materials</td></tr>
${Array.from({ length: rows }, (_, i) =>
    line(i + 1, parts[i % parts.length] + (rows > 12 ? ` (batch ${Math.floor(i / 12) + 1})` : ''), (i % 3) + 1, 45000 + (i % 7) * 12500)
  ).join('')}
              <tr><td colspan="5" class="p-2 font-semibold text-gray-700 bg-gray-50 border-b">Labour &amp; Services</td></tr>
${line(1, 'Full brake overhaul, both axles', 6, 35000)}
${line(2, 'Diagnostic and road test', 2, 40000)}
            </tbody>
          </table>

          <div class="flex justify-end" id="s-totals">
            <div class="w-72 print-keep">
              <div class="flex justify-between py-2 border-b border-gray-200">
                <span class="text-gray-600" id="t-sublabel">Subtotal (Parts)</span>
                <span class="font-medium" id="t-subval">${money(rows * 92500)}</span>
              </div>
              <div class="flex justify-between py-2 border-b border-gray-200">
                <span class="text-gray-600">Subtotal (Labour)</span>
                <span class="font-medium">290,000</span>
              </div>
              <div class="flex justify-between py-2 border-b border-gray-200 text-red-600" id="t-discount">
                <span>Discount</span><span>-20,000</span>
              </div>
              <div class="flex justify-between items-center py-2 border-b border-gray-200">
                <span class="text-gray-600">VAT (18%)</span>
                <span class="font-medium">${money(Math.round(rows * 92500 * 0.18))}</span>
              </div>
              <div class="flex justify-between py-3 border-b-2 border-blue-700 bg-blue-50 px-3 -mx-3 mt-1 rounded" id="t-totalrow">
                <span class="text-lg font-bold text-blue-900" id="t-totallabel">TOTAL</span>
                <span class="text-lg font-bold text-blue-900" id="t-totalval">TZS ${money(Math.round(rows * 92500 * 1.18) + 270000)}</span>
              </div>
            </div>
          </div>

          <div class="mt-8 pt-6 border-t border-gray-200" id="s-footer">
            <p class="text-sm text-gray-600">Payment due within 30 days. Bank: CRDB 0150-XXXX-XXX.</p>
            <p class="text-xs text-gray-400 mt-2">Thank you for your business.</p>
          </div>
        </div>
      </div>
    </main>
  </div>
</div>`

/* Contrast is measured against what the element ACTUALLY sits on: walk up to
   the first ancestor with a non-transparent background and composite down. */
const probe = `
document.documentElement.classList.add('reveal-ready');
function parse(c){if(c==='transparent')return [0,0,0,0];
  const m=String(c).match(/[0-9.]+/g);
  if(!m||m.length<3)throw new Error('unparseable colour: '+JSON.stringify(c));
  return [+m[0],+m[1],+m[2],m[3]===undefined?1:+m[3]]}
function over(fg,bg){const a=fg[3];return [fg[0]*a+bg[0]*(1-a),fg[1]*a+bg[1]*(1-a),fg[2]*a+bg[2]*(1-a),1]}
function ground(el){
  const stack=[];let n=el;
  while(n&&n!==document.documentElement){const b=parse(getComputedStyle(n).backgroundColor);if(b[3]>0)stack.push(b);n=n.parentElement}
  const hb=parse(getComputedStyle(document.documentElement).backgroundColor);
  let base=hb[3]>0?hb:[255,255,255,1];
  for(let i=stack.length-1;i>=0;i--)base=over(stack[i],base);
  return base}
function lum(c){const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2])}
function ratio(a,b){const L=lum(a),M=lum(b);return ((Math.max(L,M)+0.05)/(Math.min(L,M)+0.05))}
function hex(c){return '#'+[c[0],c[1],c[2]].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('')}
window.__auditPrint=function(){
  const out=[];
  document.querySelectorAll('[id^="t-"]').forEach(el=>{
    const bg=ground(el), fg=over(parse(getComputedStyle(el).color),bg);
    out.push({el:el.id,label:(el.textContent||'').trim().slice(0,28),ink:hex(fg),paper:hex(bg),ratio:+ratio(fg,bg).toFixed(2)})});
  return out.sort((a,b)=>a.ratio-b.ratio)}
/* Structural facts that decide fragmentation. A printer repeats <thead> only
   while its display stays table-header-group, and only honours break-inside if
   something sets it -- neither is guaranteed once a utility framework is in. */
window.__auditStructure=function(){
  const g=(s,p)=>{const e=document.querySelector(s);return e?getComputedStyle(e)[p]:'(absent)'};
  return {
    theadDisplay: g('#s-thead','display'),
    rowBreakInside: g('tbody tr','breakInside'),
    totalsOuterBreakInside: g('#s-totals','breakInside'),
    totalsKeepBreakInside: g('.print-keep','breakInside'),
    docBreakInside: g('#doc','breakInside'),
    headerPosition: g('#s-header','position'),
    headerDisplay: g('#s-header','display'),
    sidebarPosition: g('#s-sidebar','position'),
    sidebarDisplay: g('#s-sidebar','display'),
    actionsDisplay: g('#s-actions','display'),
    docOverflow: g('#doc','overflow'),
    revealOpacity: g('#doc','opacity')}}`

writeFileSync(out, `<!doctype html><meta charset="utf-8"><title>print proof</title>
<style>${css}</style>${body}<script>${probe}<\/script>`)
console.log(`${raw ? 'RAW (real @media print)' : 'colour mode (@media print forced on)'} — ${rows} part rows — from ${cssFile}`)
