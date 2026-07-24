-- =============================================
-- FEATURE (client req A4): "Mark as Paid" should record the payment AMOUNT
-- and track the outstanding BALANCE, not just flip the invoice to paid.
--
-- Source: Antony voice note PTT-20260718-WA0020 (18 Jul 2026) + screenshot
-- IMG-20260718-WA0019 — he wants an amount field, payment reference, and the
-- amount to feed "how much the customer still owes".
--
-- Changes:
--   1. add invoices.amount_paid (cumulative amount received)
--   2. allow status = 'partial' for part-paid invoices
--
-- Balance owed is derived in the app as total_amount - amount_paid (no stored
-- column, so it can never drift out of sync with the two source values).
--
-- Apply in Supabase dashboard -> SQL Editor -> Run.
-- =============================================

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(12,2) DEFAULT 0;

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('draft', 'sent', 'approved', 'partial', 'paid', 'cancelled'));
