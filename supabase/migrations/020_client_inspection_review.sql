-- =============================================
-- 020: Client inspection review — see findings, approve, or bargain
--
-- Client request 28 Jul 2026: the customer portal needs an Inspections menu
-- where a customer reads their own inspection report and either approves the
-- quoted work or negotiates the price.
--
-- The read path already existed (migration 004 gave anon SELECT on inspections
-- and inspection_items, plus UPDATE for customer_approved). What was missing:
-- a safe write path, somewhere to put a counter-offer, and a way for staff to
-- hear about it.
--
-- Apply in the Supabase dashboard -> SQL Editor -> Run.
-- =============================================

-- ---------- 1. SECURITY: close the anon price-tampering hole ----------
-- Migration 004 created "Anon can update inspection item approval" as
-- FOR UPDATE TO anon USING (true) — with no WITH CHECK and no column grants.
-- The intent was "let the customer tick approve/decline", but the effect is
-- that anyone holding the public anon key can rewrite estimated_cost,
-- problem_description or severity on any inspection item. That is exactly the
-- hole migration 006 closed for invoices and customers; inspection_items was
-- written before 006 and never got the same treatment.
--
-- RLS cannot compare OLD vs NEW on UPDATE, so — same pattern as 006 — a BEFORE
-- UPDATE trigger restores every column except the one the customer owns.
CREATE OR REPLACE FUNCTION guard_anon_inspection_item_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user = 'anon' THEN
    NEW.inspection_id       := OLD.inspection_id;
    NEW.problem_description := OLD.problem_description;
    NEW.severity            := OLD.severity;
    NEW.recommended_action  := OLD.recommended_action;
    NEW.estimated_cost      := OLD.estimated_cost;
    NEW.notes               := OLD.notes;
    NEW.sort_order          := OLD.sort_order;
    NEW.created_at          := OLD.created_at;
    -- Left mutable for the customer: customer_approved. That is the whole point
    -- of the portal's approve/decline buttons and the only thing they may touch.
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_anon_inspection_item_update ON inspection_items;
CREATE TRIGGER trg_guard_anon_inspection_item_update
  BEFORE UPDATE ON inspection_items
  FOR EACH ROW EXECUTE FUNCTION guard_anon_inspection_item_update();

-- ---------- 2. Bargaining thread ----------
-- Mirrors invoice_negotiations (migration 002) but hangs off an inspection,
-- because the haggling happens over the QUOTE, before any invoice exists.
-- inspection_item_id is nullable: null = "about the whole quote", set = "about
-- this one line". proposed_amount is nullable so a customer can just ask a
-- question without naming a number.
CREATE TABLE IF NOT EXISTS inspection_negotiations (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inspection_id      UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  inspection_item_id UUID REFERENCES inspection_items(id) ON DELETE CASCADE,
  customer_id        UUID REFERENCES customers(id) ON DELETE SET NULL,
  sender_type        TEXT NOT NULL CHECK (sender_type IN ('customer', 'staff')),
  message            TEXT NOT NULL,
  proposed_amount    NUMERIC(12,2),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inspection_negotiations_inspection
  ON inspection_negotiations(inspection_id, created_at);

ALTER TABLE inspection_negotiations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage inspection negotiations" ON inspection_negotiations;
CREATE POLICY "Staff manage inspection negotiations" ON inspection_negotiations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon read inspection negotiations" ON inspection_negotiations;
CREATE POLICY "Anon read inspection negotiations" ON inspection_negotiations
  FOR SELECT TO anon USING (true);

-- WITH CHECK on INSERT can validate the incoming row (unlike UPDATE), so this
-- is where the customer is pinned to sender_type = 'customer' — they cannot
-- forge a reply that looks like it came from the garage.
DROP POLICY IF EXISTS "Anon add inspection negotiation" ON inspection_negotiations;
CREATE POLICY "Anon add inspection negotiation" ON inspection_negotiations
  FOR INSERT TO anon
  WITH CHECK (sender_type = 'customer' AND length(trim(message)) > 0);

-- No UPDATE or DELETE for anon: a negotiation thread is a record of what was
-- said and must not be editable after the fact by either side.

-- ---------- 3. Let the portal raise these on the staff bell ----------
-- notifications only carried job_card_id / invoice_id, so an inspection alert
-- had nothing to link to and the bell would open nowhere. Header.jsx routes on
-- these columns.
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS inspection_id UUID REFERENCES inspections(id) ON DELETE CASCADE;

-- The anon INSERT policy from migration 015 whitelists notification types.
-- Without adding the new ones the insert is rejected, notifyStaff swallows the
-- error, and staff would never learn a customer had responded.
DROP POLICY IF EXISTS "Anon raise notifications" ON notifications;
CREATE POLICY "Anon raise notifications" ON notifications
  FOR INSERT TO anon
  WITH CHECK (
    type IN (
      'proforma_request',
      'payment_declared',
      'inspection_decision',   -- customer approved / declined the quoted work
      'inspection_bargain'     -- customer proposed a different price
    )
    AND is_read = FALSE
  );
