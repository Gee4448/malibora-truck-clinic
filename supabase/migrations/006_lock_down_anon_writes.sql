-- =============================================
-- Lock down anonymous (client-portal) writes
--
-- The client portal authenticates by phone with NO Supabase Auth session, so
-- every portal request hits the database as the `anon` role. Migration 002
-- granted `anon` blanket UPDATE on customers and invoices with `USING (true)`
-- and no column restrictions. That let anyone with the public anon key:
--   * self-approve their own account        (customers.status -> 'approved')
--   * overwrite another customer's password  (customers.password_hash)
--   * tamper with invoice prices / mark paid (invoices.total_amount, status)
--   * read the garage's internal cost/profit (invoices.internal_cost_*/profit_*)
--
-- RLS policies can't compare OLD vs NEW, so we guard the mutable columns with
-- BEFORE UPDATE triggers that silently restore protected columns whenever the
-- caller is the `anon` role. Authenticated staff (role `authenticated`) are
-- unaffected and keep full access. Profile edits and invoice agreement from the
-- portal still work — they just can't escalate privileges or change money.
-- =============================================

-- ---------- 1. Hide internal financials from the anon role ----------
-- Belt-and-suspenders with the client app now selecting explicit columns.
REVOKE SELECT (
  internal_cost_parts, internal_cost_labour,
  profit_parts, profit_labour, profit_total, profit_margin
) ON invoices FROM anon;

-- ---------- 2. Customers: block privilege escalation via anon UPDATE ----------
CREATE OR REPLACE FUNCTION guard_anon_customer_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only clamp portal (anon) writes; staff use the authenticated role.
  IF current_user = 'anon' THEN
    NEW.status         := OLD.status;
    NEW.password_hash  := OLD.password_hash;
    NEW.approved_by    := OLD.approved_by;
    NEW.approved_at    := OLD.approved_at;
    NEW.registered_via := OLD.registered_via;
    NEW.created_by     := OLD.created_by;
    NEW.created_at     := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_anon_customer_update ON customers;
CREATE TRIGGER trg_guard_anon_customer_update
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION guard_anon_customer_update();

-- ---------- 3. Invoices: anon may only agree / negotiate, never touch money ----------
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
    NEW.approved_by         := OLD.approved_by;
    NEW.created_at          := OLD.created_at;
    -- Left mutable for the customer: status (guarded above) + customer_agreed_at.
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_anon_invoice_update ON invoices;
CREATE TRIGGER trg_guard_anon_invoice_update
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION guard_anon_invoice_update();
