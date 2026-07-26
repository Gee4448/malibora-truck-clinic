-- =============================================
-- FEATURE (client req 2026-07-26 #1): complete the client-side workflow loop
--   request proforma -> staff approve/send -> client pays (full/partial) ->
--   staff notified -> staff confirm -> (final invoice -> handover)
--
-- Source: Antony WhatsApp voice notes 2026-07-26 (PTT 12:07:36 + 1:22:22) and
-- screenshots. Full write-up: _client-notes/REQUIREMENTS-2026-07-26.md item #1.
--
-- SECURITY MODEL (critical): the client portal has NO Supabase Auth session and
-- hits the DB as the `anon` role. Per migrations 006/010, anon must never move
-- money. So the client can only:
--   * INSERT a proforma_request  (status forced 'pending')
--   * INSERT a declared invoice_payment (status forced 'pending', customer)
--   * INSERT a staff notification (constrained type; cannot READ notifications)
-- Money on invoices (amount_paid/status/paid_at) is still only ever written by
-- authenticated staff, who CONFIRM a declared payment in the app (InvoiceDetail
-- recordPayment). anon INSERTs are constrained with RLS WITH CHECK, which — unlike
-- UPDATE — can validate the incoming row. Mirrors the invoice_negotiations pattern.
--
-- Apply in Supabase dashboard -> SQL Editor -> Run.
-- =============================================

-- ---------- 1. Staff notifications (the Header bell) ----------
CREATE TABLE IF NOT EXISTS notifications (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type         TEXT NOT NULL,                 -- 'proforma_request' | 'payment_declared'
  title        TEXT NOT NULL,
  body         TEXT,
  job_card_id  UUID REFERENCES job_cards(id) ON DELETE CASCADE,
  invoice_id   UUID REFERENCES invoices(id)  ON DELETE CASCADE,
  customer_id  UUID REFERENCES customers(id) ON DELETE SET NULL,
  is_read      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(is_read, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Staff read the bell and mark items read; the client can raise them but never read them.
DROP POLICY IF EXISTS "Staff read notifications" ON notifications;
CREATE POLICY "Staff read notifications" ON notifications
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff update notifications" ON notifications;
CREATE POLICY "Staff update notifications" ON notifications
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon raise notifications" ON notifications;
CREATE POLICY "Anon raise notifications" ON notifications
  FOR INSERT TO anon
  WITH CHECK (type IN ('proforma_request', 'payment_declared') AND is_read = FALSE);

-- ---------- 2. Proforma requests (client asks; staff fulfil) ----------
CREATE TABLE IF NOT EXISTS proforma_requests (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_card_id  UUID NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
  customer_id  UUID REFERENCES customers(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'pending',   -- pending | fulfilled
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_proforma_requests_job ON proforma_requests(job_card_id, status);

ALTER TABLE proforma_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage proforma requests" ON proforma_requests;
CREATE POLICY "Staff manage proforma requests" ON proforma_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Client can see the state of their own request (to show "Requested / pending")
-- and create one; they can never mark it fulfilled.
DROP POLICY IF EXISTS "Anon read proforma requests" ON proforma_requests;
CREATE POLICY "Anon read proforma requests" ON proforma_requests
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Anon create proforma requests" ON proforma_requests;
CREATE POLICY "Anon create proforma requests" ON proforma_requests
  FOR INSERT TO anon
  WITH CHECK (status = 'pending');

-- ---------- 3. Declared payments ledger ----------
-- The client "declares" a payment (I paid X via M-Pesa/cash). Staff CONFIRM it,
-- and only that confirmation moves invoices.amount_paid. The ledger keeps the
-- full history so partial payments (60% / 70% / balance) are auditable.
CREATE TABLE IF NOT EXISTS invoice_payments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id    UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  customer_id   UUID REFERENCES customers(id) ON DELETE SET NULL,
  amount        DECIMAL(12,2) NOT NULL,
  method        TEXT,                              -- mpesa | cash | bank | card
  reference     TEXT,
  declared_by   TEXT NOT NULL DEFAULT 'customer',  -- customer | staff
  status        TEXT NOT NULL DEFAULT 'pending',   -- pending | confirmed | rejected
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at  TIMESTAMPTZ,
  confirmed_by  UUID
);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id, status);

ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage payments" ON invoice_payments;
CREATE POLICY "Staff manage payments" ON invoice_payments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Client can see their declared payments (to show "pending confirmation") and
-- declare a new one; the WITH CHECK stops them forging a confirmed/staff payment.
DROP POLICY IF EXISTS "Anon read payments" ON invoice_payments;
CREATE POLICY "Anon read payments" ON invoice_payments
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Anon declare payment" ON invoice_payments;
CREATE POLICY "Anon declare payment" ON invoice_payments
  FOR INSERT TO anon
  WITH CHECK (declared_by = 'customer' AND status = 'pending' AND amount > 0);

-- ---------- 4. Let the portal read its own running balance ----------
-- amount_paid was added in migration 012, AFTER 010's explicit anon column grant,
-- so anon currently can't SELECT it (a `select` naming it 400s). It is the
-- customer's own payment total (not cost/profit), so exposing it is safe and lets
-- the portal show "balance owed" on partial payments.
GRANT SELECT (amount_paid) ON invoices TO anon;
