// Billing arithmetic. Deliberately free of imports — no supabase, no React — so
// it can be exercised directly by `npm test` instead of being re-typed into a
// test file and verified by eye.
//
// Everything that decides what a proforma's stored numbers should become lives
// here. `proforma.js` is the thin layer that reads and writes them.

export const DEFAULT_VAT_RATE = 18

// Rounding tolerance on money comparisons — half a cent, matching what the
// invoice page uses when it decides whether a bill is settled.
export const PAID_EPSILON = 0.005

// Totals for a job card's item list. Kept in one place because the same sum has
// to come out identically whether a proforma is being created, refreshed after
// a job-card edit, or re-derived on the invoice page — three copies of this
// arithmetic is how a quote and its job card drift apart.
//
// Profit is measured against the PRE-VAT subtotal: VAT is collected for the TRA
// and passed on, so counting it as profit overstates every job.
export function totalsFromJobItems(items, vatRate = DEFAULT_VAT_RATE) {
  const sum = (type, field) => items
    .filter(i => i.item_type === type)
    .reduce((s, i) => s + Number(i[field] || 0), 0)

  const subtotal_parts = sum('part', 'total_selling')
  const subtotal_labour = sum('labour', 'total_selling')
  const subtotal_additional = sum('additional', 'total_selling')
  const subtotal = subtotal_parts + subtotal_labour + subtotal_additional

  const rate = Number.isFinite(Number(vatRate)) ? Number(vatRate) : DEFAULT_VAT_RATE
  const vat_amount = subtotal * rate / 100

  const cost_parts = sum('part', 'total_cost')
  const cost_labour = sum('labour', 'total_cost')
  const profit_total = subtotal - cost_parts - cost_labour

  return {
    subtotal_parts,
    subtotal_labour,
    subtotal_additional,
    vat_rate: rate,
    vat_amount,
    total_amount: subtotal + vat_amount,
    internal_cost_parts: cost_parts,
    internal_cost_labour: cost_labour,
    profit_parts: subtotal_parts - cost_parts,
    profit_labour: subtotal_labour - cost_labour,
    profit_total,
    profit_margin: subtotal > 0 ? (profit_total / subtotal * 100) : 0,
  }
}

// Re-derive an invoice's payment status after its TOTAL has moved.
//
// Antony, 4 Aug 2026: a customer who has already paid can have parts added to
// the same job while he's still in the workshop, and pays the difference on the
// same proforma. So money already received is never touched — only the total
// moves, and the status has to follow it, or a `paid` invoice that grew stays
// labelled paid and the "record payment" button stays hidden with a balance
// still owed.
//
// Statuses that aren't about money (draft/sent/approved, i.e. nothing received)
// are left exactly as they are — a re-total is not an approval.
export function statusAfterRetotal(currentStatus, amountPaid, newTotal, currentPaidAt = null) {
  const paid = Number(amountPaid) || 0
  const total = Number(newTotal) || 0
  if (paid <= 0) return {}

  const settled = paid >= total - PAID_EPSILON
  return {
    status: settled ? 'paid' : 'partial',
    // Stamp paid_at when it settles, but don't move a date that's already
    // there; clear it when the job grew back past what was paid.
    paid_at: settled ? (currentPaidAt || new Date().toISOString()) : null,
  }
}

// Deposit is stored as CASH (`deposit_amount`) alongside its percentage, and the
// customer's copy prefers the stored figure over recomputing it. After a
// re-total that figure is stale — the proforma would show "70%" beside an amount
// that is 70% of a total it no longer carries. Restate it from the new total.
export function depositAfterRetotal(depositPercentage, newTotal) {
  const pct = Number(depositPercentage) || 0
  if (pct <= 0) return {}
  return { deposit_amount: (Number(newTotal) || 0) * pct / 100 }
}

// Money collected beyond the current total, or 0.
//
// Before 4 Aug 2026 this couldn't arise: a paid proforma was frozen, so its
// total could never drop below what had been banked. Now that staff can re-price
// a paid job, removing a line can leave the garage holding the customer's money.
// The app has no refund ledger, so the least it can do is say so out loud rather
// than showing "paid, balance 0" and letting it disappear.
export function overpaymentOn(amountPaid, total) {
  const over = (Number(amountPaid) || 0) - (Number(total) || 0)
  return over > PAID_EPSILON ? over : 0
}

// What an invoice's money columns become after money is handed back.
//
// `amount_paid` is the NET amount currently held, so a refund decrements it just
// as a payment increments it (migration 027) — every balance in the app is
// `total_amount - amount_paid` and keeps working untouched. The gross history
// lives in the invoice_refunds ledger.
//
// A refund that empties the invoice can't leave it labelled `paid`, and
// statusAfterRetotal deliberately says nothing when nothing is held, so the
// fully-refunded case is decided here: back to `approved`, which is where a
// quote the customer agreed to but has not paid belongs.
export function invoiceAfterRefund(invoice, refundAmount) {
  const held = Number(invoice?.amount_paid) || 0
  const amount = Math.min(Math.max(Number(refundAmount) || 0, 0), held)
  const newPaid = held - amount

  if (newPaid <= PAID_EPSILON) {
    return { amount_paid: 0, status: 'approved', paid_at: null }
  }
  return {
    amount_paid: newPaid,
    ...statusAfterRetotal(invoice?.status, newPaid, invoice?.total_amount, invoice?.paid_at),
  }
}

// The most that can be handed back: you cannot refund money you never took.
export function refundLimitFor(invoice) {
  return Math.max(0, Number(invoice?.amount_paid) || 0)
}

// The complete set of columns a live proforma should be updated to, given the
// job card's current items. One function so the "generate/update proforma"
// button and the automatic refresh after a job-card edit cannot disagree about
// what a re-total means — they were separate code paths, and that is exactly how
// the totals and the status drifted apart before.
export function proformaUpdateFor(proforma, items) {
  const totals = totalsFromJobItems(items || [], proforma?.vat_rate)
  return {
    ...totals,
    ...statusAfterRetotal(
      proforma?.status,
      proforma?.amount_paid,
      totals.total_amount,
      proforma?.paid_at,
    ),
    ...depositAfterRetotal(proforma?.deposit_percentage, totals.total_amount),
  }
}
