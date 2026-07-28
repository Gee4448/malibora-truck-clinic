-- =============================================
-- 022: Customer-raised inspection requests + make negotiations reach staff
--
-- Client request 28 Jul 2026 (Antony):
--   * "when the client request for an inspection then the request should go in
--      inspection tab and not jobcards"
--   * "add ADD button in inspection tab"
--   * "when the clients request negotiations the message should appear to the
--      staff and owner dashboard"
--
-- Until now the portal's "I need an inspection" button inserted a JOB CARD with
-- request_type = 'inspection_needed' (ClientNewRequest.jsx). Staff therefore had
-- to find inspection requests in the Job Cards tab and hand-create the matching
-- inspections row. This lets the portal create the inspections row directly.
--
-- SECURITY MODEL (unchanged from 006/010/015/020/021): the portal is the `anon`
-- role and must never move money or set its own price. A customer-raised
-- inspection is therefore pinned to status 'requested' with a zero fee — staff
-- name the fee afterwards, exactly as they always did.
--
-- Apply in the Supabase dashboard -> SQL Editor -> Run.
-- =============================================

-- ---------- 1. A status for "customer asked, we have not quoted yet" ----------
-- inspection_workflow.sql started every inspection at 'pending_payment', which
-- reads as "the customer owes us money" — wrong for a request that has no fee
-- on it yet, and it would light up the dashboard's Requested counter with rows
-- staff have never seen. 'requested' is the step before 'pending_payment'.
ALTER TABLE inspections DROP CONSTRAINT IF EXISTS inspections_status_check;
ALTER TABLE inspections ADD CONSTRAINT inspections_status_check
  CHECK (status IN ('requested', 'pending_payment', 'paid', 'in_progress', 'completed', 'cancelled'));

-- Where the truck is. job_cards already had customer_location (migration 002)
-- and the portal's inspection form has always collected it; with the request
-- now landing on inspections instead, the column has to exist here too or the
-- answer is silently dropped and nobody knows where to send the mechanic.
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS customer_location TEXT;

-- ---------- 2. Let the customer raise one (and nothing more) ----------
-- WITH CHECK validates the incoming row on INSERT — unlike UPDATE, which is why
-- money-touching columns are pinned here rather than trusted to the client.
DROP POLICY IF EXISTS "Anon create inspection requests" ON inspections;
CREATE POLICY "Anon create inspection requests" ON inspections
  FOR INSERT TO anon
  WITH CHECK (
    status = 'requested'
    AND payment_status = 'unpaid'
    AND COALESCE(payment_amount, 0) = 0
  );

-- No anon UPDATE or DELETE policy on inspections, deliberately: once raised, a
-- request is staff's to move. (Customers still act on inspection_ITEMS, guarded
-- by the trigger in migration 020.)

-- Supabase's default grants give anon a table-level INSERT covering every
-- column, which would let a request also set inspected_by, date_completed or
-- notes. Same fix as migration 010: drop the table-level grant, hand back only
-- the columns the request form actually fills.
REVOKE INSERT ON inspections FROM anon;
GRANT INSERT (
  customer_id, vehicle_id, description, customer_location,
  status, payment_status, payment_amount
) ON inspections TO anon;

-- ---------- 3. Two more notification types ----------
-- The whitelist is re-stated in full each time (015 -> 020 -> 021 -> here);
-- a type that is missing gets its INSERT rejected, notifyStaff swallows the
-- error by design, and the alert is lost with no trace in the UI.
DROP POLICY IF EXISTS "Anon raise notifications" ON notifications;
CREATE POLICY "Anon raise notifications" ON notifications
  FOR INSERT TO anon
  WITH CHECK (
    type IN (
      'proforma_request',
      'payment_declared',
      'inspection_decision',           -- customer approved / declined quoted work
      'inspection_bargain',            -- customer proposed a different price
      'inspection_payment_declared',   -- customer says they paid the inspection fee
      'inspection_request',            -- customer asked for a new inspection
      'invoice_bargain'                -- customer sent a message on an invoice
    )
    AND is_read = FALSE
  );

-- ---------- 4. Make the bell actually ring ----------
-- useNotifications subscribes to postgres_changes on `notifications`, but the
-- table was never added to the realtime publication (migration 015 created it
-- and stopped there). The subscription has been a no-op ever since: staff only
-- ever saw notifications that already existed when the page loaded, so a
-- negotiation sent while someone had the dashboard open went unnoticed until
-- the next refresh. This is the fix for "the message should appear to staff".
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;

-- inspection_negotiations (migration 020) was never published either, so the
-- staff side of a bargaining thread does not live-update while it is open.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'inspection_negotiations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE inspection_negotiations;
  END IF;
END $$;
