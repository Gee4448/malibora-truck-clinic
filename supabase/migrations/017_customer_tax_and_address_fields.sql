-- =============================================
-- 017: Customer tax fields + structured address, and inspection-fee backfill
--
-- Client request 27 Jul 2026 (see _client-notes/REQUIREMENTS-2026-07-28.md):
--   #3  Add TIN + VRN to the customer record, split the single free-text
--       address into Mkoa / Wilaya / Street, and add a P.O. Box field.
--   #4  The inspection fee was saved on inspections.payment_amount but never
--       carried onto the job card, so it vanished from invoices and from the
--       customer's portal. The app fix handles new inspections; the backfill
--       at the bottom repairs job cards already created without the fee line.
--
-- Apply in the Supabase dashboard -> SQL Editor -> Run.
-- =============================================

-- ---------- #3: new customer columns ----------
-- VRN = VAT Registration Number. Kept alongside tin_number; both are tax
-- identifiers that belong on an invoice, and both stay hidden from anon.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS vrn_number TEXT;

-- Structured address. The legacy free-text `address` column is intentionally
-- left in place: existing rows still hold data there and the UI falls back to
-- it when the structured fields are empty. Nothing is dropped or rewritten.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS region TEXT;    -- Mkoa
ALTER TABLE customers ADD COLUMN IF NOT EXISTS district TEXT;  -- Wilaya
ALTER TABLE customers ADD COLUMN IF NOT EXISTS street TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS po_box TEXT;

-- ---------- anon column privileges (see migration 010) ----------
-- 010 replaced the table-level SELECT with an explicit column list, so new
-- columns are invisible to the portal until granted. Address parts are safe to
-- expose (the old `address` already was); vrn_number is a tax identifier and
-- stays hidden alongside tin_number.
GRANT SELECT (region, district, street, po_box) ON customers TO anon;

-- ---------- #4: backfill the missing inspection fees ----------
-- For every job card created from a paid inspection that carries a fee, add
-- the fee as an approved 'additional' line — unless such a line already exists.
-- Idempotent: re-running matches the same description and inserts nothing.
INSERT INTO job_card_items (
  job_card_id, item_type, description, quantity,
  cost_price, selling_price, is_additional, requires_approval, approval_status
)
SELECT
  jc.id,
  'additional',
  'Inspection Fee - ' || i.inspection_number,
  1,
  0,
  i.payment_amount,
  false,
  false,
  'approved'
FROM job_cards jc
JOIN inspections i ON i.id = jc.inspection_id
WHERE i.payment_amount > 0
  AND NOT EXISTS (
    SELECT 1 FROM job_card_items existing
    WHERE existing.job_card_id = jc.id
      AND existing.description LIKE '%' || i.inspection_number || '%'
      AND existing.item_type = 'additional'
  );

-- NOTE: invoices already generated from those job cards keep their old totals.
-- Regenerate any affected proforma to pick the fee up.


-- ---------- #5: why the profit figures look "missing" ----------
-- Nothing to build here — per-job profit and the Reports page already exist.
-- They are gated on `canViewInternal`, which is true only for role
-- 'owner' or 'manager' (see src/contexts/AuthContext.jsx). Accounts are
-- auto-created as 'receptionist', so an owner who signed up through the normal
-- flow sees no Reports link in the sidebar and no profit anywhere.
--
-- There is no in-app screen to change a role (Settings shows it read-only), so
-- promote the account here. REPLACE the email, then uncomment and run:
--
--   UPDATE profiles SET role = 'owner'
--   WHERE id = (SELECT id FROM auth.users WHERE email = 'REPLACE@example.com');
--
-- Check the current state first:
--   SELECT u.email, p.full_name, p.role
--   FROM profiles p JOIN auth.users u ON u.id = p.id
--   ORDER BY p.role;
