-- =============================================
-- 041: A quotation for a customer who has no job card — or no vehicle
--
-- Client voice notes 25 Sep 2026 (Antony): someone walks in wanting a price
-- for work on a truck — sometimes a truck he has not registered, sometimes
-- no truck at all yet — and there was no way to quote him. The only path to
-- a proforma was job card -> proforma, and a job card needs a vehicle, plus
-- fuel level, mileage and a promise date that mean nothing for a quote.
-- "Kwenye menu yetu tuongeze quotation."
--
-- A quotation is a proforma whose job_card_id is NULL. Its line items live in
-- invoice_items (the snapshot table from 013), which the invoice page already
-- knows how to edit. It may carry a vehicle directly (vehicle_id) and/or a
-- free-text subject ("Scania R420 gearbox overhaul") for the case with no
-- vehicle on file. When the truck arrives, "Create job card" on the
-- quotation makes the job card, moves the lines onto it and links the two,
-- after which it is an ordinary job-card proforma.
--
-- Apply in the Supabase dashboard -> SQL Editor -> Run, before deploying:
-- the app selects vehicle_id/subject and inserts NULL job_card_id.
-- =============================================

-- ---------- 1. Columns ----------
ALTER TABLE invoices ALTER COLUMN job_card_id DROP NOT NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subject TEXT;
CREATE INDEX IF NOT EXISTS idx_invoices_vehicle ON invoices(vehicle_id);

-- The portal shows the customer what the quote is for (010-style column grant).
GRANT SELECT (vehicle_id, subject) ON invoices TO anon;

-- ---------- 2. Anon guard: the two new columns are staff-only ----------
-- Same function as 040 with vehicle_id and subject pinned to OLD.
CREATE OR REPLACE FUNCTION guard_anon_invoice_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user = 'anon' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status NOT IN ('negotiating', 'approved') THEN
      NEW.status := OLD.status;
    END IF;
    IF OLD.status IN ('partial', 'paid', 'cancelled') THEN
      NEW.status := OLD.status;
    END IF;

    IF NEW.customer_agreed_at IS NOT NULL AND OLD.customer_agreed_at IS NULL THEN
      NEW.agreed_total      := OLD.total_amount;
      NEW.approval_reset_at := NULL;
      NEW.approved_by       := NULL;
    ELSE
      NEW.customer_agreed_at := OLD.customer_agreed_at;
      NEW.agreed_total       := OLD.agreed_total;
      NEW.approval_reset_at  := OLD.approval_reset_at;
      NEW.approved_by        := OLD.approved_by;
    END IF;

    NEW.invoice_number      := OLD.invoice_number;
    NEW.invoice_type        := OLD.invoice_type;
    NEW.job_card_id         := OLD.job_card_id;
    NEW.vehicle_id          := OLD.vehicle_id;
    NEW.subject             := OLD.subject;
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
