-- =============================================
-- 021: Let the customer pay the inspection fee from the portal
--
-- Client request 28 Jul 2026: the Checks (Ukaguzi) screen shows the inspection
-- fee but gives the customer no way to pay it. An inspection starts at
-- status 'pending_payment' and only staff could ever move it off that, by
-- filling the payment form in the admin InspectionDetail screen.
--
-- SECURITY MODEL (unchanged, and the reason this is a ledger and not an UPDATE):
-- the portal is the `anon` role and must never move money. Per migrations
-- 006/010/015, anon may only DECLARE a payment; staff CONFIRM it, and only that
-- confirmation writes inspections.payment_status / status / date_paid. This
-- mirrors invoice_payments (migration 015) exactly — same shape, same rules,
-- keyed on an inspection instead of an invoice.
--
-- Apply in the Supabase dashboard -> SQL Editor -> Run.
-- =============================================

CREATE TABLE IF NOT EXISTS inspection_payments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  customer_id   UUID REFERENCES customers(id) ON DELETE SET NULL,
  amount        DECIMAL(12,2) NOT NULL,
  method        TEXT,                              -- mobile_money | cash | bank_transfer | cheque
  reference     TEXT,
  declared_by   TEXT NOT NULL DEFAULT 'customer',  -- customer | staff
  status        TEXT NOT NULL DEFAULT 'pending',   -- pending | confirmed | rejected
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at  TIMESTAMPTZ,
  confirmed_by  UUID
);

CREATE INDEX IF NOT EXISTS idx_inspection_payments_inspection
  ON inspection_payments(inspection_id, status);

ALTER TABLE inspection_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage inspection payments" ON inspection_payments;
CREATE POLICY "Staff manage inspection payments" ON inspection_payments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- The customer can see what they declared (so the portal can show "waiting for
-- confirmation") but cannot edit or delete it afterwards.
DROP POLICY IF EXISTS "Anon read inspection payments" ON inspection_payments;
CREATE POLICY "Anon read inspection payments" ON inspection_payments
  FOR SELECT TO anon USING (true);

-- WITH CHECK validates the incoming row on INSERT (unlike UPDATE), so this is
-- where the customer is stopped from forging a confirmed or staff-declared
-- payment, or a zero/negative amount.
DROP POLICY IF EXISTS "Anon declare inspection payment" ON inspection_payments;
CREATE POLICY "Anon declare inspection payment" ON inspection_payments
  FOR INSERT TO anon
  WITH CHECK (declared_by = 'customer' AND status = 'pending' AND amount > 0);

-- ---------- Let the portal ring the staff bell for this ----------
-- Same whitelist as migrations 015 and 020; without the new type the insert is
-- rejected, notifyStaff swallows the error, and a declared payment would sit
-- unnoticed forever.
DROP POLICY IF EXISTS "Anon raise notifications" ON notifications;
CREATE POLICY "Anon raise notifications" ON notifications
  FOR INSERT TO anon
  WITH CHECK (
    type IN (
      'proforma_request',
      'payment_declared',
      'inspection_decision',
      'inspection_bargain',
      'inspection_payment_declared'   -- customer says they paid the inspection fee
    )
    AND is_read = FALSE
  );
