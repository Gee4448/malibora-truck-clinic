import { supabase } from './supabase'
import { proformaUpdateFor } from './billing'

// The arithmetic lives in billing.js (import-free, so it can be unit tested).
// Re-exported here because every caller already imports it from this module.
export {
  DEFAULT_VAT_RATE,
  totalsFromJobItems,
  statusAfterRetotal,
  depositAfterRetotal,
  overpaymentOn,
  proformaUpdateFor,
} from './billing'

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
// An approved or already-paid proforma re-totals like any other. It used to
// return null here, which meant a job-card edit saved the line item and left the
// quote showing its old figures with no error — the customer's document and the
// work order silently disagreed. Antony hit exactly that on 4 Aug 2026.
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

    const update = proformaUpdateFor(proforma, items || [])
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
