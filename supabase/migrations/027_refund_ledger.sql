-- =============================================
-- 027: Refund ledger
--
-- Antony, 5 Aug 2026, answering the question left open by the 4 Aug top-up work.
--
-- Making a paid proforma re-priceable (4 Aug) created a case that could not
-- happen before: staff remove a line and the total drops below what has already
-- been banked, leaving the garage holding the customer's money. Until now the
-- app could only WARN about that. This is where the money going back is recorded.
--
-- Shape deliberately mirrors invoice_payments (migration 015) so the two halves
-- of the money trail read the same way.
--
-- The running figure `invoices.amount_paid` means NET money currently held: a
-- refund decrements it, exactly as a payment increments it. That keeps every
-- existing balance calculation (total_amount - amount_paid) correct without
-- touching it, and this table is what preserves the gross history. A refund is
-- recorded by staff only — the client portal can see refunds but never create
-- one.
--
-- Apply in the Supabase dashboard -> SQL Editor -> Run.
-- =============================================

CREATE TABLE IF NOT EXISTS invoice_refunds (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id   UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  customer_id  UUID REFERENCES customers(id) ON DELETE SET NULL,
  amount       DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  method       TEXT,                            -- cash | mobile_money | bank
  reference    TEXT,
  reason       TEXT,
  refunded_by  UUID,                            -- staff user id, null if unknown
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoice_refunds_invoice ON invoice_refunds(invoice_id);

ALTER TABLE invoice_refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage refunds" ON invoice_refunds;
CREATE POLICY "Staff manage refunds" ON invoice_refunds
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- The customer sees money going back to them on their own copy of the invoice.
-- Read only: there is no anon INSERT/UPDATE/DELETE policy here, and none should
-- be added — 006 and 010 exist to keep the portal from writing money rows.
DROP POLICY IF EXISTS "Anon read refunds" ON invoice_refunds;
CREATE POLICY "Anon read refunds" ON invoice_refunds
  FOR SELECT TO anon USING (true);

-- 010 reshaped privileges on several tables, so be explicit rather than relying
-- on Supabase's defaults.
GRANT SELECT ON invoice_refunds TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON invoice_refunds TO authenticated;
