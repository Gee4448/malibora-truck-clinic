import test from 'node:test'
import assert from 'node:assert/strict'
import {
  JOB_STAGE_KEYS, INSPECTION_STAGE_KEYS, jobStage, inspectionStage,
  isQuoteAwaitingCustomer, amountOutstanding, isInspectionAwaitingPayment,
} from './clientStages.js'

// ---------------------------------------------------------------------------
// jobStage
// ---------------------------------------------------------------------------

test('a customer request sits at the first stage', () => {
  const s = jobStage({ status: 'customer_request' })
  assert.equal(s.index, 0)
  assert.equal(s.key, 'requested')
  assert.equal(s.cancelled, false)
})

test('a pre-job card is at the quotation stage', () => {
  assert.equal(jobStage({ status: 'pre_job_card' }).key, 'quoted')
  assert.equal(jobStage({ status: 'pending_approval' }).key, 'quoted')
})

test('open, in progress and waiting-for-parts all read as in repair', () => {
  for (const status of ['open', 'in_progress', 'waiting_parts']) {
    assert.equal(jobStage({ status }).key, 'repair', status)
  }
})

test('a completed job with no invoice yet stops at repair', () => {
  // Honest rather than flattering: the work is done but nothing has been billed,
  // so the track must not claim the customer has an invoice waiting.
  assert.equal(jobStage({ status: 'completed' }).key, 'repair')
})

test('a final invoice advances the track past the job status', () => {
  const s = jobStage({ status: 'completed' }, { hasFinalInvoice: true })
  assert.equal(s.key, 'invoiced')
  assert.equal(s.index, 3)
})

test('a handover is the last stage and wins over the invoice', () => {
  const s = jobStage({ status: 'completed' }, { hasFinalInvoice: true, hasHandover: true })
  assert.equal(s.key, 'delivered')
  assert.equal(s.index, JOB_STAGE_KEYS.length - 1)
})

test('a handover never drags an early-status job backwards', () => {
  // Math.max guards this: an out-of-order record must not un-advance the track.
  assert.equal(jobStage({ status: 'open' }, { hasHandover: true }).index, 4)
})

test('a cancelled job has no position on the track', () => {
  const s = jobStage({ status: 'cancelled' }, { hasFinalInvoice: true })
  assert.equal(s.cancelled, true)
  assert.equal(s.index, -1)
})

test('a missing job is treated as cancelled rather than stage zero', () => {
  assert.equal(jobStage(null).cancelled, true)
})

test('an unknown status falls back to the first stage', () => {
  assert.equal(jobStage({ status: 'something_new' }).index, 0)
})

// ---------------------------------------------------------------------------
// inspectionStage
// ---------------------------------------------------------------------------

test('an inspection walks requested -> paid -> inspecting -> report', () => {
  assert.equal(inspectionStage({ status: 'requested' }).key, 'requested')
  assert.equal(inspectionStage({ status: 'pending_payment' }).key, 'requested')
  assert.equal(inspectionStage({ status: 'paid' }).key, 'paid')
  assert.equal(inspectionStage({ status: 'in_progress' }).key, 'inspecting')
  assert.equal(inspectionStage({ status: 'completed' }).key, 'report')
  assert.equal(inspectionStage({ status: 'completed' }).index, INSPECTION_STAGE_KEYS.length - 1)
})

test('a cancelled inspection has no position on the track', () => {
  assert.equal(inspectionStage({ status: 'cancelled' }).cancelled, true)
})

// ---------------------------------------------------------------------------
// "Needs your attention"
// ---------------------------------------------------------------------------

test('only a sent or negotiating proforma is waiting on the customer', () => {
  assert.equal(isQuoteAwaitingCustomer({ invoice_type: 'proforma', status: 'sent' }), true)
  assert.equal(isQuoteAwaitingCustomer({ invoice_type: 'proforma', status: 'negotiating' }), true)
  // A draft has not been shown to them yet; approved/paid are already decided.
  assert.equal(isQuoteAwaitingCustomer({ invoice_type: 'proforma', status: 'draft' }), false)
  assert.equal(isQuoteAwaitingCustomer({ invoice_type: 'proforma', status: 'approved' }), false)
  assert.equal(isQuoteAwaitingCustomer({ invoice_type: 'final', status: 'sent' }), false)
})

test('outstanding is total minus what is currently held', () => {
  assert.equal(amountOutstanding({ status: 'sent', total_amount: 100000, amount_paid: 40000 }), 60000)
  assert.equal(amountOutstanding({ status: 'paid', total_amount: 100000, amount_paid: 100000 }), 0)
})

test('an overpaid document owes nothing rather than a negative amount', () => {
  assert.equal(amountOutstanding({ status: 'sent', total_amount: 100000, amount_paid: 130000 }), 0)
})

test('draft and cancelled documents are never chased for payment', () => {
  assert.equal(amountOutstanding({ status: 'draft', total_amount: 100000 }), 0)
  assert.equal(amountOutstanding({ status: 'cancelled', total_amount: 100000 }), 0)
})

test('an inspection awaiting payment is waiting on the customer', () => {
  assert.equal(isInspectionAwaitingPayment({ status: 'pending_payment' }), true)
  assert.equal(isInspectionAwaitingPayment({ status: 'paid' }), false)
})
