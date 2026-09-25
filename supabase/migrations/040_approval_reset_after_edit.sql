-- =============================================
-- 040: An approval is for a figure — editing the figure voids it
--
-- Client report 25 Sep 2026 (Antony): "if an invoice is edited after it was
-- already approved, it must go back to the customer to approve, or to the
-- admin."
--
-- Until now `customer_agreed_at` stayed set however much the job card was
-- re-priced afterwards, so a customer who agreed to 635,000 could find himself
-- "approved" for 900,000 without ever being asked.
--
-- Three columns carry the rule (the arithmetic is in src/lib/billing.js):
--   agreed_total       the total the agreement was given for. After a reset it
--                      keeps the OLD figure so both portals can say
--                      "agreed at X, now Y".
--   approval_reset_at  when an edit voided the agreement; NULL once somebody
--                      agrees to the new figure. Set + no customer_agreed_at =
--                      "waiting for re-approval".
--   approved_by        (exists since 001) now means "staff member who approved
--                      on the customer's behalf"; NULL when the customer did.
--
-- Also: the customer may now approve a quote that already carries a deposit
-- (status `partial`), because that is exactly the shape a re-approval takes —
-- the money story and the approval story are separate columns now.
--
-- Apply in the Supabase dashboard -> SQL Editor -> Run. Deploy the matching
-- app change first or together: the portal selects the new columns.
-- =============================================

-- ---------- 1. Columns ----------
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS agreed_total NUMERIC(14,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS approval_reset_at TIMESTAMPTZ;

-- Agreements given before this migration were for whatever the total is now
-- (nothing else was ever recorded), so the first edit after this runs will be
-- compared against that.
UPDATE invoices
SET agreed_total = total_amount
WHERE customer_agreed_at IS NOT NULL AND agreed_total IS NULL;

-- The portal reads them (010 replaced anon's table-level SELECT with a column
-- list, so a new column is invisible to the customer until granted).
GRANT SELECT (agreed_total, approval_reset_at) ON invoices TO anon;

-- ---------- 2. Anon guard: the customer may agree, never forge ----------
-- Same function as 006, with the two new columns handled. The customer can:
--   * set customer_agreed_at (agreeing) — the DB then stamps agreed_total from
--     the CURRENT total and clears approval_reset_at itself, so a portal write
--     cannot claim agreement to a smaller figure than the document carries;
--   * move status to negotiating/approved, and now ALSO leave `partial` alone
--     when re-agreeing to a quote that already holds a deposit.
-- Everything else is pinned to OLD, as before.
CREATE OR REPLACE FUNCTION guard_anon_invoice_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user = 'anon' THEN
    -- Status may only move to negotiating/approved (customer agreement flow).
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status NOT IN ('negotiating', 'approved') THEN
      NEW.status := OLD.status;
    END IF;
    -- A quote with money against it keeps its money status whatever the
    -- portal sends; the agreement lives in customer_agreed_at.
    IF OLD.status IN ('partial', 'paid', 'cancelled') THEN
      NEW.status := OLD.status;
    END IF;

    -- Agreeing: the server decides what figure was agreed to.
    IF NEW.customer_agreed_at IS NOT NULL AND OLD.customer_agreed_at IS NULL THEN
      NEW.agreed_total      := OLD.total_amount;
      NEW.approval_reset_at := NULL;
      NEW.approved_by       := NULL;   -- the customer, not a staff member
    ELSE
      NEW.customer_agreed_at := OLD.customer_agreed_at;
      NEW.agreed_total       := OLD.agreed_total;
      NEW.approval_reset_at  := OLD.approval_reset_at;
      NEW.approved_by        := OLD.approved_by;
    END IF;

    -- Everything below is off-limits to the customer.
    NEW.invoice_number      := OLD.invoice_number;
    NEW.invoice_type        := OLD.invoice_type;
    NEW.job_card_id         := OLD.job_card_id;
    NEW.customer_id         := OLD.customer_id;
    NEW.subtotal_parts      := OLD.subtotal_parts;
    NEW.subtotal_labour     := OLD.subtotal_labour;
    NEW.subtotal_additional := OLD.subtotal_additional;
    NEW.vat_rate            := OLD.vat_rate;
    NEW.vat_amount          := OLD.vat_amount;
    NEW.discount_amount     := OLD.discount_amount;
    NEW.total_amount        := OLD.total_amount;
    NEW.amount_paid         := OLD.amount_paid;
    NEW.internal_cost_parts := OLD.internal_cost_parts;
    NEW.internal_cost_labour:= OLD.internal_cost_labour;
    NEW.profit_parts        := OLD.profit_parts;
    NEW.profit_labour       := OLD.profit_labour;
    NEW.profit_total        := OLD.profit_total;
    NEW.profit_margin       := OLD.profit_margin;
    NEW.payment_method      := OLD.payment_method;
    NEW.payment_reference   := OLD.payment_reference;
    NEW.paid_at             := OLD.paid_at;
    NEW.deposit_percentage  := OLD.deposit_percentage;
    NEW.deposit_amount      := OLD.deposit_amount;
    NEW.notes               := OLD.notes;
    NEW.created_by          := OLD.created_by;
    NEW.created_at          := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_anon_invoice_update ON invoices;
CREATE TRIGGER trg_guard_anon_invoice_update
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION guard_anon_invoice_update();

-- ---------- 3. The bell: staff hear when the customer (re-)agrees ----------
-- Previously a customer agreeing to a proforma raised nothing; staff found out
-- by opening the document. With re-approval in the loop that silence would
-- stall jobs, so agreeing now rings the bell like a declared payment does.
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
      'invoice_bargain',               -- customer sent a message on an invoice
      'proforma_agreed'                -- customer agreed (or re-agreed) to a quote
    )
    AND is_read = FALSE
  );
