-- =============================================
-- FEATURE (client req B1): automated SMS to customers on key events
-- (inspection complete, invoice ready, car ready for pickup).
--
-- Source: Antony voice note PTT-20260718-WA0024.
--
-- Architecture: a Supabase Edge Function `send-sms` (supabase/functions/send-sms)
-- calls the Beem Africa API using SECRET credentials stored as function secrets,
-- so the API key never reaches the browser. This table logs every attempt so
-- staff can see what went out. The Edge Function (service role) writes the log.
--
-- INACTIVE until Beem credentials are set as function secrets:
--   supabase secrets set BEEM_API_KEY=... BEEM_SECRET_KEY=... BEEM_SENDER_ID=...
-- Until then, sends are recorded with status 'skipped' and nothing is sent.
--
-- Apply in Supabase dashboard -> SQL Editor -> Run.
-- =============================================

CREATE TABLE IF NOT EXISTS sms_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  to_phone TEXT NOT NULL,
  message TEXT NOT NULL,
  event TEXT,                                  -- inspection_complete | invoice_ready | car_ready
  status TEXT NOT NULL DEFAULT 'queued',       -- sent | failed | skipped
  provider_response JSONB,
  customer_id UUID REFERENCES customers(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_log_created ON sms_log(created_at DESC);

ALTER TABLE sms_log ENABLE ROW LEVEL SECURITY;

-- Staff can read the log; the Edge Function writes it with the service role
-- (which bypasses RLS), so no INSERT policy is needed for normal operation.
DROP POLICY IF EXISTS "Auth read sms log" ON sms_log;
CREATE POLICY "Auth read sms log" ON sms_log
  FOR SELECT TO authenticated USING (true);
