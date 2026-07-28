-- =============================================
-- 019: The missing DELETE policies
--
-- Bug (reported 28 Jul 2026): deleting a customer said "Customer deleted" and
-- the customer was still in the list afterwards.
--
-- Cause: migration 001 turned RLS on for customers, vehicles and the rest, and
-- created SELECT / INSERT / UPDATE policies for `authenticated` — but never a
-- DELETE policy. Under RLS a DELETE matching no policy is NOT an error. It
-- simply matches zero rows. PostgREST answers 204 No Content, supabase-js
-- reports error = null, so the app showed a success toast and the refetch put
-- the row straight back. Nothing was ever deleted, and nothing ever complained.
--
-- Migration 018 relies on this same mechanism deliberately ("with RLS on and no
-- policy, nothing reaches this table through PostgREST") — here it was an
-- oversight rather than a decision.
--
-- The same silent no-op affects vehicles and inspection_items. invoice_items
-- and job_card_items got DELETE policies in migration 013, which is why
-- removing an invoice line is the only delete in the app that has ever worked.
--
-- What this does NOT do is make customers freely erasable. job_cards, invoices,
-- handover_cards and inspections all reference customers(id) with no ON DELETE
-- action, so deleting a customer who has any history now raises a foreign-key
-- violation (23503) that the app catches and explains. That is the behaviour we
-- want: a customer with invoices is a financial record and must not be erasable.
-- Only vehicles cascade (001), and notifications / proforma_requests /
-- invoice_payments null out (015).
--
-- Apply in the Supabase dashboard -> SQL Editor -> Run.
-- =============================================

-- Table-level privilege first: the policy decides WHICH rows, the grant decides
-- whether the role may issue DELETE at all. Supabase grants these by default,
-- but 010 has already reshaped privileges on customers, so be explicit.
GRANT DELETE ON customers        TO authenticated;
GRANT DELETE ON vehicles         TO authenticated;
GRANT DELETE ON inspection_items TO authenticated;

DROP POLICY IF EXISTS "Staff can delete" ON customers;
CREATE POLICY "Staff can delete" ON customers
  FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff can delete" ON vehicles;
CREATE POLICY "Staff can delete" ON vehicles
  FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff can delete" ON inspection_items;
CREATE POLICY "Staff can delete" ON inspection_items
  FOR DELETE TO authenticated USING (true);

-- Deliberately NOT granted to anon. The client portal must never delete
-- anything, and 006/010 exist to keep it that way.
