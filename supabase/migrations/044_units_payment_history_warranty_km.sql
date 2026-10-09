-- =============================================
-- 044: Units on lines, a dated payment history, who approved, km warranty
--
-- Client corrections 6-7 Oct 2026 (Antony, chat + voice notes):
--
--   1. "tupate button ya unit kama pc, hours, set, meter, pack, kg, litre,
--      bottle" — every line said "1 hrs" for labour whatever the work was.
--      job_card_items.unit / invoice_items.unit: free text, NULL on old lines
--      (they print the bare quantity, as parts always did).
--
--   2. "miamala iliyowekwa naipataje hapa, inanipa jumla tu" / "tarehe ya
--      mwamala ni muhimu" / "anaye hakiki pesa imeingia aandike jina lake na
--      kama kuna uwezekano wa signature": a payment the office receives is
--      now a ROW in invoice_payments (until now only the customer's declared
--      payments were; the office just bumped invoices.amount_paid), carrying
--      the day the money moved, the name of whoever checked it arrived, and
--      an optional drawn signature (a small PNG data URL).
--
--   3. "anaye approve proforma badala ya mteja pia aandike jina lake":
--      invoices.approved_by_name, typed at the moment of approving. The
--      approved_by uuid stays — it is the login that pressed the button, which
--      on a shared office computer is not always the person.
--
--   4. Handover warranty in kilometres as well as days (parts and labour).
--
-- Not a deploy blocker in the strict sense — but deploy the app WITH it:
-- the app writes the new columns, so recording a payment, approving, saving a
-- line or a handover fails ("column ... does not exist") until this has run.
--
-- Apply in the Supabase dashboard -> SQL Editor -> Run.
-- =============================================

-- ---------- 1. Units ----------
ALTER TABLE job_card_items ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE invoice_items  ADD COLUMN IF NOT EXISTS unit TEXT;

-- Hours the mechanics logged and the office billed (034) really are hours.
UPDATE job_card_items SET unit = 'hrs'
WHERE unit IS NULL AND item_type = 'labour'
  AND id IN (SELECT job_card_item_id FROM labour_entries WHERE job_card_item_id IS NOT NULL);

-- ---------- 2. Payment history ----------
ALTER TABLE invoice_payments ADD COLUMN IF NOT EXISTS paid_on DATE;
ALTER TABLE invoice_payments ADD COLUMN IF NOT EXISTS received_by_name TEXT;
ALTER TABLE invoice_payments ADD COLUMN IF NOT EXISTS signature TEXT;

-- The customer's portal reads its own declared payments; it has no business
-- reading staff names or signatures. Same column-grant pattern as 010.
REVOKE SELECT ON invoice_payments FROM anon;
GRANT SELECT (
  id, invoice_id, customer_id, amount, method, reference,
  declared_by, status, created_at, confirmed_at, paid_on
) ON invoice_payments TO anon;

-- A customer declaring a payment cannot pre-sign it as checked.
DROP POLICY IF EXISTS "Anon declare payment" ON invoice_payments;
CREATE POLICY "Anon declare payment" ON invoice_payments
  FOR INSERT TO anon
  WITH CHECK (
    declared_by = 'customer' AND status = 'pending' AND amount > 0
    AND received_by_name IS NULL AND signature IS NULL
  );

-- ---------- 3. Who approved on the customer's behalf ----------
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS approved_by_name TEXT;

-- 040's anon guard pins columns one by one, so a new column is writable by
-- the portal until something pins it. A separate trigger keeps 040 intact.
CREATE OR REPLACE FUNCTION guard_anon_invoice_approver()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user = 'anon' THEN
    IF NEW.customer_agreed_at IS NOT NULL AND OLD.customer_agreed_at IS NULL THEN
      NEW.approved_by_name := NULL;   -- the customer agreed themselves
    ELSE
      NEW.approved_by_name := OLD.approved_by_name;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_anon_invoice_approver ON invoices;
CREATE TRIGGER trg_guard_anon_invoice_approver
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION guard_anon_invoice_approver();

GRANT SELECT (approved_by_name) ON invoices TO anon;

-- ---------- 4. Warranty by kilometres ----------
-- A warranty is EITHER days or km; the unused one is NULL. Old cards are days.
ALTER TABLE handover_cards ADD COLUMN IF NOT EXISTS warranty_parts_km  INTEGER;
ALTER TABLE handover_cards ADD COLUMN IF NOT EXISTS warranty_labour_km INTEGER;
ALTER TABLE handover_cards ALTER COLUMN warranty_parts_days  DROP DEFAULT;
ALTER TABLE handover_cards ALTER COLUMN warranty_labour_days DROP DEFAULT;
