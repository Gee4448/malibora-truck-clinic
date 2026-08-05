import { supabase } from './supabase'

export const DEFAULT_VAT_RATE = 18

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

// Rounding tolerance on money comparisons — the same 0.005 used wherever else
// this app decides whether a bill is settled.
const PAID_EPSILON = 0.005

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

// The one live proforma for a job card, or null. Cancelled ones are superseded
// history and deliberately ignored — same rule as the unique index in
// migration 023, so the app and the constraint agree on what "the" proforma is.
export async function findLiveProforma(jobCardId) {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, vat_rate, amount_paid, total_amount, paid_at, deposit_percentage')
    .eq('job_card_id', jobCardId)
    .eq('invoice_type', 'proforma')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data || null
}

// Re-derive a live proforma's stored totals from the job card's current items.
//
// A proforma shows its LINE ITEMS straight from job_card_items but its TOTALS
// from its own columns, so editing the job card used to change the lines while
// the totals stayed at whatever they were when the quote was generated. This is
// what keeps the two halves of the document telling the same story.
//
// Silent no-op when the job card has no live proforma — most job-card edits
// happen before anyone has quoted anything.
//
// The invoice's OWN vat_rate is preserved: VAT is per-invoice (migration 012)
// and resetting it to the 18% default would quietly undo a deliberate change.
//
// An approved or already-paid proforma re-totals like any other. It used to
// return null here, which meant a job-card edit saved the line item and left the
// quote showing its old figures with no error — the customer's document and the
// work order silently disagreed. Antony hit exactly that on 4 Aug 2026. Payment
// status is re-derived so the balance owed follows the new total.
export async function syncProformaTotals(jobCardId) {
  if (!jobCardId) return null
  try {
    const proforma = await findLiveProforma(jobCardId)
    if (!proforma) return null

    const { data: items, error } = await supabase
      .from('job_card_items')
      .select('item_type, total_selling, total_cost')
      .eq('job_card_id', jobCardId)
    if (error) throw error

    const totals = totalsFromJobItems(items || [], proforma.vat_rate)
    const update = {
      ...totals,
      ...statusAfterRetotal(proforma.status, proforma.amount_paid, totals.total_amount, proforma.paid_at),
      ...depositAfterRetotal(proforma.deposit_percentage, totals.total_amount),
    }
    const { error: updErr } = await supabase
      .from('invoices')
      .update(update)
      .eq('id', proforma.id)
    if (updErr) throw updErr

    return { ...proforma, ...update }
  } catch (err) {
    // Never block the staff member's actual edit on a bookkeeping refresh.
    console.error('syncProformaTotals failed:', err.message)
    return null
  }
}
