// Run with: npm test
//
// These import the REAL src/lib/billing.js. An earlier version of this suite
// re-typed the functions into the test file, which proved the arithmetic was
// right but not that the shipped code contained it.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  totalsFromJobItems,
  statusAfterRetotal,
  depositAfterRetotal,
  overpaymentOn,
  proformaUpdateFor,
  invoiceAfterRefund,
  refundLimitFor,
  DEFAULT_VAT_RATE,
} from './billing.js'

const OLD_DATE = '2026-08-01T10:00:00.000Z'

// The job Antony filmed: Full Service 70,000 + oil 2x250,000 + two filters.
const ANTONY_ITEMS = [
  { item_type: 'labour', total_selling: 70000, total_cost: 0 },
  { item_type: 'part', total_selling: 500000, total_cost: 400000 },
  { item_type: 'part', total_selling: 35000, total_cost: 25000 },
  { item_type: 'part', total_selling: 30000, total_cost: 20000 },
]

test('totals: the filmed job comes to 635,000 before VAT', () => {
  const t = totalsFromJobItems(ANTONY_ITEMS, 0)
  assert.equal(t.subtotal_parts + t.subtotal_labour + t.subtotal_additional, 635000)
  assert.equal(t.total_amount, 635000)
})

test('totals: VAT is added on top, and profit excludes it', () => {
  const t = totalsFromJobItems(ANTONY_ITEMS, 18)
  assert.equal(t.vat_amount, 635000 * 0.18)
  assert.equal(t.total_amount, 635000 * 1.18)
  // Profit measured against the PRE-VAT subtotal — VAT belongs to the TRA.
  assert.equal(t.profit_total, 635000 - 445000)
})

test('totals: logged labour (hours x rate) flows into labour subtotal and profit', () => {
  // A labour line billed from the workshop clock: 6.5 h @ 20,000, cost 8,000/h
  // (migration 034). It must land in subtotal_labour and its margin in profit.
  const withLabour = [
    ...ANTONY_ITEMS.filter(i => i.item_type === 'part'), // 565,000 sell / 445,000 cost
    { item_type: 'labour', total_selling: 6.5 * 20000, total_cost: 6.5 * 8000 },
  ]
  const t = totalsFromJobItems(withLabour, 0)
  assert.equal(t.subtotal_labour, 130000)
  assert.equal(t.internal_cost_labour, 52000)
  assert.equal(t.profit_labour, 78000)
  // 565,000 - 445,000 parts profit + 78,000 labour profit
  assert.equal(t.profit_total, 120000 + 78000)
})

test('totals: a bad vat rate falls back to the default rather than NaN', () => {
  const t = totalsFromJobItems(ANTONY_ITEMS, undefined)
  assert.equal(t.vat_rate, DEFAULT_VAT_RATE)
  assert.ok(Number.isFinite(t.total_amount))
})

test('status: Antony\'s case — paid in full, then parts added', () => {
  assert.deepEqual(
    statusAfterRetotal('paid', 635000, 735000, OLD_DATE),
    { status: 'partial', paid_at: null },
  )
})

test('status: a partial payment stays partial when the job grows', () => {
  assert.deepEqual(
    statusAfterRetotal('partial', 400000, 735000, null),
    { status: 'partial', paid_at: null },
  )
})

test('status: settling keeps the original paid_at rather than moving it', () => {
  assert.deepEqual(
    statusAfterRetotal('partial', 400000, 380000, OLD_DATE),
    { status: 'paid', paid_at: OLD_DATE },
  )
})

test('status: first settle stamps a real date', () => {
  const r = statusAfterRetotal('partial', 380000, 380000, null)
  assert.equal(r.status, 'paid')
  assert.ok(!Number.isNaN(Date.parse(r.paid_at)))
})

test('status: nothing paid means nothing to change — a re-total is not an approval', () => {
  assert.deepEqual(statusAfterRetotal('draft', 0, 735000, null), {})
  assert.deepEqual(statusAfterRetotal('approved', 0, 735000, null), {})
  assert.deepEqual(statusAfterRetotal('sent', null, 735000, null), {})
})

test('status: rounding tolerance either side of half a cent', () => {
  assert.equal(statusAfterRetotal('partial', 734999.996, 735000, OLD_DATE).status, 'paid')
  assert.equal(statusAfterRetotal('paid', 734999, 735000, OLD_DATE).status, 'partial')
})

test('deposit: restated against the new total, not left at the old cash figure', () => {
  assert.deepEqual(depositAfterRetotal(70, 735000), { deposit_amount: 514500 })
  assert.deepEqual(depositAfterRetotal(100, 735000), { deposit_amount: 735000 })
})

test('deposit: no percentage set means the column is left alone', () => {
  assert.deepEqual(depositAfterRetotal(0, 735000), {})
  assert.deepEqual(depositAfterRetotal(null, 735000), {})
})

test('overpayment: only counts when it exceeds the rounding tolerance', () => {
  assert.equal(overpaymentOn(735000, 635000), 100000)
  assert.equal(overpaymentOn(635000, 635000), 0)
  assert.equal(overpaymentOn(400000, 635000), 0)
  assert.equal(overpaymentOn(635000.004, 635000), 0) // within epsilon, not a refund
})

// --- the wiring, which is what the hand-copied suite could not reach ---

test('update: a paid proforma that grows becomes partial with the right balance', () => {
  const proforma = {
    status: 'paid', amount_paid: 635000, paid_at: OLD_DATE,
    vat_rate: 0, deposit_percentage: 70,
  }
  const grown = [...ANTONY_ITEMS, { item_type: 'part', total_selling: 100000, total_cost: 80000 }]
  const u = proformaUpdateFor(proforma, grown)

  assert.equal(u.total_amount, 735000)
  assert.equal(u.status, 'partial')
  assert.equal(u.paid_at, null)
  assert.equal(u.total_amount - proforma.amount_paid, 100000) // he owes the difference
  assert.equal(u.deposit_amount, 514500)                      // deposit restated
  assert.equal(overpaymentOn(proforma.amount_paid, u.total_amount), 0)
})

test('update: an unpaid proforma keeps its status untouched', () => {
  const u = proformaUpdateFor(
    { status: 'approved', amount_paid: 0, vat_rate: 0, deposit_percentage: 0 },
    ANTONY_ITEMS,
  )
  assert.equal(u.total_amount, 635000)
  assert.ok(!('status' in u), 'a re-total must not re-stamp an approved quote')
  assert.ok(!('paid_at' in u))
  assert.ok(!('deposit_amount' in u))
})

test('update: shrinking a paid job below what was collected owes a refund', () => {
  const proforma = {
    status: 'paid', amount_paid: 635000, paid_at: OLD_DATE,
    vat_rate: 0, deposit_percentage: 0,
  }
  const shrunk = ANTONY_ITEMS.filter(i => i.total_selling !== 500000) // oil removed
  const u = proformaUpdateFor(proforma, shrunk)

  assert.equal(u.total_amount, 135000)
  assert.equal(u.status, 'paid')
  assert.equal(u.paid_at, OLD_DATE, 'settled date must not drift on a re-total')
  assert.equal(overpaymentOn(proforma.amount_paid, u.total_amount), 500000)
})

test('update: the proforma\'s own VAT rate survives a re-total', () => {
  // VAT is per-invoice (migration 012); resetting it to 18% would quietly undo
  // a deliberate change.
  const u = proformaUpdateFor({ status: 'draft', amount_paid: 0, vat_rate: 5 }, ANTONY_ITEMS)
  assert.equal(u.vat_rate, 5)
  assert.equal(u.vat_amount, 635000 * 0.05)
})

test('update: an empty job card zeroes the quote without producing NaN', () => {
  const u = proformaUpdateFor({ status: 'draft', amount_paid: 0, vat_rate: 18 }, [])
  assert.equal(u.total_amount, 0)
  assert.equal(u.profit_margin, 0)
})

// --- refunds (migration 027) ---

test('refund: handing back an over-collection settles the invoice exactly', () => {
  // Paid 635,000, job shrank to 135,000 — 500,000 is owed back.
  const inv = { status: 'paid', amount_paid: 635000, total_amount: 135000, paid_at: OLD_DATE }
  assert.equal(overpaymentOn(inv.amount_paid, inv.total_amount), 500000)

  const after = invoiceAfterRefund(inv, 500000)
  assert.equal(after.amount_paid, 135000)
  assert.equal(after.status, 'paid')
  assert.equal(after.paid_at, OLD_DATE)
  assert.equal(overpaymentOn(after.amount_paid, inv.total_amount), 0, 'refund clears the warning')
})

test('refund: a partial refund drops a settled invoice back to partial', () => {
  const inv = { status: 'paid', amount_paid: 635000, total_amount: 635000, paid_at: OLD_DATE }
  const after = invoiceAfterRefund(inv, 100000)
  assert.equal(after.amount_paid, 535000)
  assert.equal(after.status, 'partial')
  assert.equal(after.paid_at, null)
})

test('refund: giving everything back returns the invoice to approved, not paid', () => {
  const inv = { status: 'paid', amount_paid: 635000, total_amount: 635000, paid_at: OLD_DATE }
  const after = invoiceAfterRefund(inv, 635000)
  assert.deepEqual(after, { amount_paid: 0, status: 'approved', paid_at: null })
})

test('refund: cannot hand back more than was taken', () => {
  const inv = { status: 'partial', amount_paid: 400000, total_amount: 635000, paid_at: null }
  const after = invoiceAfterRefund(inv, 999999)
  assert.equal(after.amount_paid, 0, 'clamped to what was held')
  assert.equal(after.status, 'approved')
  assert.equal(refundLimitFor(inv), 400000)
})

test('refund: junk and negative amounts leave the money alone', () => {
  const inv = { status: 'partial', amount_paid: 400000, total_amount: 635000, paid_at: null }
  for (const bad of [0, -50, null, undefined, NaN, 'abc']) {
    assert.equal(invoiceAfterRefund(inv, bad).amount_paid, 400000, `refund of ${String(bad)}`)
  }
})

test('refund: nothing taken means nothing can be given back', () => {
  assert.equal(refundLimitFor({ amount_paid: 0 }), 0)
  assert.equal(refundLimitFor({}), 0)
  assert.equal(refundLimitFor(null), 0)
})

test('refund: sub-cent remainder settles to zero rather than leaving a dust balance', () => {
  const inv = { status: 'paid', amount_paid: 635000, total_amount: 635000, paid_at: OLD_DATE }
  const after = invoiceAfterRefund(inv, 634999.999)
  assert.equal(after.amount_paid, 0)
  assert.equal(after.status, 'approved')
})

// ---------------------------------------------------------------------------
// Customer approval survives only while the figure it was given for does
// (migration 040; Antony, 25 Sep 2026)
// ---------------------------------------------------------------------------

import {
  agreedTotalOf,
  approvalAfterRetotal,
  needsReapproval,
  staffApprovalUpdate,
  customerApprovalUpdate,
  receivableOn,
} from './billing.js'

const AGREED = { status: 'approved', customer_agreed_at: OLD_DATE, agreed_total: 635000, total_amount: 635000, amount_paid: 0 }

test('approval: a total that moves off the agreed figure voids the agreement', () => {
  const out = approvalAfterRetotal(AGREED, 700000)
  assert.equal(out.customer_agreed_at, null)
  assert.equal(out.agreed_total, 635000, 'the OLD figure is kept for the "was X" banner')
  assert.ok(out.approval_reset_at)
  assert.equal(out.approved_by, null)
  assert.equal(out.status, 'sent', 'unpaid approved quote goes back to waiting for an answer')
})

test('approval: an unchanged total keeps the agreement', () => {
  assert.deepEqual(approvalAfterRetotal(AGREED, 635000), {})
  assert.deepEqual(approvalAfterRetotal(AGREED, 635000.004), {})
})

test('approval: nothing to void when the customer never agreed', () => {
  assert.deepEqual(approvalAfterRetotal({ status: 'sent', total_amount: 100 }, 200), {})
  assert.deepEqual(approvalAfterRetotal(null, 200), {})
})

test('approval: a pre-040 agreement (no stored figure) counts the stored total as agreed', () => {
  const legacy = { status: 'approved', customer_agreed_at: OLD_DATE, total_amount: 500000, amount_paid: 0 }
  assert.equal(agreedTotalOf(legacy), 500000)
  assert.deepEqual(approvalAfterRetotal(legacy, 500000), {})
  assert.equal(approvalAfterRetotal(legacy, 520000).agreed_total, 500000)
})

test('approval: with a deposit held, the money status stays and only the approval is reset', () => {
  const paid = { ...AGREED, status: 'partial', amount_paid: 400000 }
  const out = approvalAfterRetotal(paid, 700000)
  assert.equal(out.customer_agreed_at, null)
  assert.equal('status' in out, false, 'partial/paid is statusAfterRetotal\'s call')
})

test('approval: proformaUpdateFor voids the approval as part of the same re-total', () => {
  const items = [{ item_type: 'part', total_selling: 700000, total_cost: 500000 }]
  const out = proformaUpdateFor({ ...AGREED, vat_rate: 0 }, items)
  assert.equal(out.total_amount, 700000)
  assert.equal(out.customer_agreed_at, null)
  assert.equal(out.status, 'sent')
  // Same items, same figure: approval untouched.
  const same = proformaUpdateFor({ ...AGREED, vat_rate: 0 }, [{ item_type: 'part', total_selling: 635000, total_cost: 0 }])
  assert.equal('customer_agreed_at' in same, false)
})

test('approval: needsReapproval is the reset-and-not-yet-re-agreed state only', () => {
  assert.equal(needsReapproval({ approval_reset_at: OLD_DATE, customer_agreed_at: null, status: 'sent' }), true)
  assert.equal(needsReapproval({ approval_reset_at: OLD_DATE, customer_agreed_at: OLD_DATE, status: 'approved' }), false)
  assert.equal(needsReapproval({ approval_reset_at: null, customer_agreed_at: null, status: 'sent' }), false)
  assert.equal(needsReapproval({ approval_reset_at: OLD_DATE, customer_agreed_at: null, status: 'cancelled' }), false)
})

test('approval: staff approving on the customer\'s behalf signs it and clears the reset', () => {
  const inv = { status: 'sent', total_amount: 700000, approval_reset_at: OLD_DATE }
  const out = staffApprovalUpdate(inv, 'staff-1', OLD_DATE)
  assert.deepEqual(out, {
    customer_agreed_at: OLD_DATE, agreed_total: 700000, approval_reset_at: null,
    approved_by: 'staff-1', status: 'approved',
  })
  // A deposit already taken is not undone by re-approval.
  assert.equal('status' in staffApprovalUpdate({ ...inv, status: 'partial' }, 'staff-1'), false)
})

test('approval: the customer\'s own agreement carries the figure but no staff signature', () => {
  const out = customerApprovalUpdate({ status: 'sent', total_amount: 700000 }, OLD_DATE)
  assert.deepEqual(out, { customer_agreed_at: OLD_DATE, agreed_total: 700000, approval_reset_at: null, status: 'approved' })
  assert.equal('approved_by' in out, false)
})

test('receivable: what can still be taken, whatever the status says', () => {
  assert.equal(receivableOn({ status: 'approved', total_amount: 635000, amount_paid: 0 }), 635000)
  assert.equal(receivableOn({ status: 'partial', total_amount: 635000, amount_paid: 400000 }), 235000)
  assert.equal(receivableOn({ status: 'paid', total_amount: 635000, amount_paid: 635000 }), 0)
  assert.equal(receivableOn({ status: 'paid', total_amount: 700000, amount_paid: 635000 }), 65000, 'a "paid" label with money owed still shows the button')
  assert.equal(receivableOn({ status: 'cancelled', total_amount: 635000, amount_paid: 0 }), 0)
  assert.equal(receivableOn({ status: 'draft', total_amount: 0, amount_paid: 0 }), 0)
  assert.equal(receivableOn(null), 0)
})
