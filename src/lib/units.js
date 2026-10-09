// Units of measure for job-card / quotation / invoice lines (migration 044).
//
// Antony, 6 Oct 2026: "tupate button ya unit kama pc, hours, set, meter,
// pack, kg, litre, bottle". Until then labour printed "1 hrs" whatever the
// work was, and parts printed a bare number.
//
// The unit is free text on the row: the picker offers this list, and staff may
// type their own ("drum", "roll"). Import-free so it can be unit tested.

export const UNITS = ['pc', 'hrs', 'set', 'pair', 'm', 'pack', 'kg', 'L', 'bottle', 'box', 'roll', 'trip', 'job', 'lot']

// What a new line starts with. Labour defaults to `job` (a whole piece of
// work) — `hrs` is for time actually counted: a catalog service with estimated
// hours, or hours the mechanics logged.
export function defaultUnit(itemType) {
  return itemType === 'part' ? 'pc' : 'job'
}

export function cleanUnit(unit) {
  const u = String(unit ?? '').trim()
  return u ? u.slice(0, 20) : null
}

// "3 pc", "1.5 hrs", or just "3" for a line saved before units existed.
export function formatQty(quantity, unit) {
  const q = Number(quantity)
  const n = Number.isFinite(q) ? String(q) : String(quantity ?? '')
  const u = cleanUnit(unit)
  return u ? `${n} ${u}` : n
}
