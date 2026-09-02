/* Render the REAL shipped CSS with `@media print` forced on, over the real
   invoice markup, and measure what the ink actually computes to on paper.
   Writes a standalone harness page; open it and run window.__auditPrint(). */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'

const cssFile = readdirSync('dist/assets').find(f => f.endsWith('.css'))
let css = readFileSync(`dist/assets/${cssFile}`, 'utf8')

// Force print rules on WITHOUT moving them: same position, same specificity,
// so the cascade resolves exactly as a printer would resolve it.
const printCount = (css.match(/@media print\{/g) || []).length
css = css.replace(/@media print\{/g, '@media all{')
if (printCount !== 3) throw new Error(`expected 3 print blocks, found ${printCount}`)

// The printable half of InvoiceDetail.jsx, class strings copied verbatim.
const body = `
<div class="max-w-4xl mx-auto p-6">
  <div class="bg-white rounded-2xl border border-gray-200 p-8" id="doc">
    <h1 class="text-2xl font-bold text-gray-900" id="t-title">TAX INVOICE</h1>
    <p class="text-gray-600" id="t-meta">INV-2026-0042 &middot; 2 Sep 2026</p>
    <p class="text-gray-500" id="t-sub">Malibora Truck Clinic &middot; Dar es Salaam</p>

    <table class="w-full text-sm mb-6">
      <thead>
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
        <tr class="border-b border-gray-100">
          <td class="p-2.5 text-gray-500" id="t-idx">1</td>
          <td class="p-2.5" id="t-desc">Brake pad set, front axle</td>
          <td class="p-2.5 text-right">2</td>
          <td class="p-2.5 text-right">180,000</td>
          <td class="p-2.5 text-right font-medium" id="t-amt">360,000</td>
        </tr>
      </tbody>
    </table>

    <div class="flex justify-end"><div class="w-72">
      <div class="flex justify-between py-2 border-b border-gray-200">
        <span class="text-gray-600" id="t-sublabel">Subtotal (Parts)</span>
        <span class="font-medium" id="t-subval">360,000</span>
      </div>
      <div class="flex justify-between py-2 border-b border-gray-200 text-red-600" id="t-discount">
        <span>Discount</span><span>-20,000</span>
      </div>
      <div class="flex justify-between py-3 border-b-2 border-blue-700 bg-blue-50 px-3 -mx-3 mt-1 rounded" id="t-totalrow">
        <span class="text-lg font-bold text-blue-900" id="t-totallabel">TOTAL</span>
        <span class="text-lg font-bold text-blue-900" id="t-totalval">TZS 401,200</span>
      </div>
    </div></div>
  </div>
</div>`

// Contrast is measured against what the element ACTUALLY sits on: walk up to
// the first ancestor with a non-transparent background and composite down.
const probe = `
function parse(c){if(c==="transparent")return [0,0,0,0];const m=String(c).match(/[0-9.]+/g);if(!m||m.length<3)throw new Error("unparseable colour: "+JSON.stringify(c));return [+m[0],+m[1],+m[2],m[3]===undefined?1:+m[3]]}
function over(fg,bg){const a=fg[3];return [fg[0]*a+bg[0]*(1-a),fg[1]*a+bg[1]*(1-a),fg[2]*a+bg[2]*(1-a),1]}
function ground(el){
  const stack=[];let n=el;
  while(n&&n!==document.documentElement){const b=parse(getComputedStyle(n).backgroundColor);if(b[3]>0)stack.push(b);n=n.parentElement}
  const hb=parse(getComputedStyle(document.documentElement).backgroundColor);
  let base=hb[3]>0?hb:[255,255,255,1];
  for(let i=stack.length-1;i>=0;i--)base=over(stack[i],base);
  return base
}
function lum(c){const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2])}
function ratio(a,b){const L=lum(a),M=lum(b);return ((Math.max(L,M)+0.05)/(Math.min(L,M)+0.05))}
function hex(c){return '#'+[c[0],c[1],c[2]].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('')}
window.__auditPrint=function(){
  const out=[];
  document.querySelectorAll('[id^="t-"]').forEach(el=>{
    const fgRaw=parse(getComputedStyle(el).color);
    const bg=ground(el);
    const fg=over(fgRaw,bg);
    out.push({el:el.id,label:(el.textContent||'').trim().slice(0,28),ink:hex(fg),paper:hex(bg),ratio:+ratio(fg,bg).toFixed(2)})
  });
  out.sort((a,b)=>a.ratio-b.ratio);
  return out
}`

writeFileSync(process.argv[2], `<!doctype html><meta charset="utf-8"><title>print proof</title>
<style>${css}</style>${body}<script>${probe}<\/script>`)
console.log('harness written from', cssFile)
