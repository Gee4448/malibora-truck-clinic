-- =============================================
-- 024: Tell the customer where to send the money
--
-- Client request 28 Jul 2026 (Antony):
--   "after the client saw his invoice, if it's proforma or anything, there's no
--    option for him to pay. You should add the option for him to pay either by
--    bank, by pay number, or by any means which we will provide by ourselves."
--
-- The portal could already DECLARE a payment (migration 015) but never told the
-- customer what to pay into — no bank account, no mobile-money number. Staff
-- maintain these in Settings; the portal reads the active ones and shows them
-- on the invoice and inspection-fee payment screens.
--
-- Apply in the Supabase dashboard -> SQL Editor -> Run.
-- =============================================

CREATE TABLE IF NOT EXISTS payment_channels (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_type   TEXT NOT NULL CHECK (channel_type IN ('bank', 'mobile_money', 'cash', 'other')),
  label          TEXT NOT NULL,              -- "CRDB Bank", "M-Pesa Lipa Namba"
  account_name   TEXT,                       -- name the account is held in
  account_number TEXT,                       -- account / till / pay number
  instructions   TEXT,                       -- anything else the customer needs
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_channels_active
  ON payment_channels(is_active, sort_order);

ALTER TABLE payment_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage payment channels" ON payment_channels;
CREATE POLICY "Staff manage payment channels" ON payment_channels
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Read-only for the portal, and only the ones staff have switched on. These are
-- the garage's own published payment details — nothing customer-specific lives
-- in this table, so anon SELECT is the whole point of it.
DROP POLICY IF EXISTS "Anon read active payment channels" ON payment_channels;
CREATE POLICY "Anon read active payment channels" ON payment_channels
  FOR SELECT TO anon USING (is_active = TRUE);

-- No anon INSERT/UPDATE/DELETE: a customer must never be able to add or edit an
-- account number that other customers would then be told to pay into. Supabase
-- grants these at table level by default, so they have to be taken away —
-- an RLS policy alone would not be enough if one were ever added by mistake.
REVOKE INSERT, UPDATE, DELETE ON payment_channels FROM anon;

CREATE OR REPLACE FUNCTION touch_payment_channels_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_payment_channels ON payment_channels;
CREATE TRIGGER trg_touch_payment_channels
  BEFORE UPDATE ON payment_channels
  FOR EACH ROW EXECUTE FUNCTION touch_payment_channels_updated_at();
