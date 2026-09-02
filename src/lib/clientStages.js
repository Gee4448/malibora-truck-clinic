// Customer-facing stage tracks.
//
// Odoo's customer portal never asks the customer to decode a status word — every
// document sits on a fixed track ("New → Estimate → Repair → Invoice → Done") and
// the customer reads their position off it at a glance. Malibora's internal
// statuses are richer than a track (waiting_parts, negotiating, cancelled…), so
// this module collapses them onto the few stages a customer actually cares about.
//
// Pure functions, no imports — the money/`billing.js` precedent: easy to unit test
// and safe to call from any surface (dashboard, list row, detail page).

// ---------------------------------------------------------------------------
// Job cards
// ---------------------------------------------------------------------------

// Five stages, not Odoo/Probuse's eight — a phone screen fits five labels, and
// the extra Odoo states (Estimation Approved, Repair Start/End) are transitions
// the customer experiences as one step each.
export const JOB_STAGE_KEYS = ['requested', 'quoted', 'repair', 'invoiced', 'delivered']

const JOB_IN_REPAIR = ['open', 'in_progress', 'waiting_parts', 'completed']
const JOB_QUOTING = ['pre_job_card', 'pending_approval']

/**
 * Where a job card sits on the customer track.
 *
 * The later stages cannot be read off `job.status` alone — a job is "Invoiced"
 * when a final invoice exists and "Delivered" when a handover card exists, both
 * of which live in other tables. Callers pass what they know; anything omitted
 * simply means that stage has not been reached.
 *
 * @returns {{ index: number, key: string, cancelled: boolean }}
 *          `index` is the furthest stage REACHED (-1 when cancelled).
 */
export function jobStage(job, { hasFinalInvoice = false, hasHandover = false } = {}) {
  if (!job || job.status === 'cancelled') {
    return { index: -1, key: 'cancelled', cancelled: true }
  }
  let index = 0
  if (JOB_QUOTING.includes(job.status)) index = 1
  if (JOB_IN_REPAIR.includes(job.status)) index = 2
  // A job can be invoiced or handed over while its own status still reads
  // `completed`, so these override rather than extend the status ladder.
  if (hasFinalInvoice) index = Math.max(index, 3)
  if (hasHandover) index = Math.max(index, 4)
  return { index, key: JOB_STAGE_KEYS[index], cancelled: false }
}

// ---------------------------------------------------------------------------
// Inspections
// ---------------------------------------------------------------------------

// Inspections are a paid product here, so the track starts at the request and
// runs through payment — that gate is the customer's own action and belongs on
// the track, not hidden behind a status badge.
export const INSPECTION_STAGE_KEYS = ['requested', 'paid', 'inspecting', 'report']

const INSPECTION_INDEX = {
  requested: 0,
  pending_payment: 0,
  paid: 1,
  in_progress: 2,
  completed: 3,
}

/** Where an inspection sits on the customer track. Same shape as `jobStage`. */
export function inspectionStage(inspection) {
  if (!inspection || inspection.status === 'cancelled') {
    return { index: -1, key: 'cancelled', cancelled: true }
  }
  const index = INSPECTION_INDEX[inspection.status] ?? 0
  return { index, key: INSPECTION_STAGE_KEYS[index], cancelled: false }
}

// ---------------------------------------------------------------------------
// "Needs your attention"
// ---------------------------------------------------------------------------

// Odoo's portal surfaces the documents waiting on the CUSTOMER (sign this, pay
// that) rather than making them hunt through lists. These predicates define what
// counts as waiting on them here.

/** A quote the customer has not yet accepted or rejected. */
export function isQuoteAwaitingCustomer(invoice) {
  return invoice?.invoice_type === 'proforma'
    && ['sent', 'negotiating'].includes(invoice.status)
}

/** Money still owed on a document the garage has issued. */
export function amountOutstanding(invoice) {
  if (!invoice || invoice.status === 'cancelled' || invoice.status === 'draft') return 0
  const total = Number(invoice.total_amount) || 0
  // `amount_paid` is the NET amount held (refunds decrement it) — see billing.js.
  const paid = Number(invoice.amount_paid) || 0
  return Math.max(0, total - paid)
}

/** An inspection the customer must pay for before the workshop starts. */
export function isInspectionAwaitingPayment(inspection) {
  return inspection?.status === 'pending_payment'
}
