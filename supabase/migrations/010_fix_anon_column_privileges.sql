-- =============================================
-- FIX: migration 006's column hiding never worked
--
-- 006 ran `REVOKE SELECT (internal_cost_*, profit_*) ON invoices FROM anon`,
-- but Postgres column-level REVOKE only removes column-level GRANTs. Supabase
-- gives `anon` a TABLE-level SELECT on every public table, and a table-level
-- grant covers all columns regardless of column-level revokes. Verified live
-- on 2026-07-16: anon could still read invoices.profit_total AND — worse —
-- customers.password_hash (bcrypt hashes of every client).
--
-- Correct approach: drop the table-level SELECT and grant back only the safe
-- columns. The 006 BEFORE UPDATE trigger guards are fine and stay as-is
-- (verified working: anon PATCH on protected columns is silently reverted).
--
-- IMPORTANT: deploy the matching app change first (ClientAuthContext no longer
-- selects * from customers) — with column grants, a `select=*` query fails
-- with "permission denied" instead of returning the allowed subset.
--
-- Apply in the Supabase dashboard → SQL Editor → Run.
-- =============================================

-- ---------- customers: hide password_hash, IDs, and staff-internal fields ----------
REVOKE SELECT ON customers FROM anon;
GRANT SELECT (
  id, full_name, phone, email, company_name, address, location,
  status, registered_via, created_at, updated_at
) ON customers TO anon;
-- Hidden from the portal: password_hash, tin_number, id_type, id_number,
-- notes, created_by, approved_by, approved_at.

-- ---------- invoices: hide internal cost/profit and staff-internal fields ----------
REVOKE SELECT ON invoices FROM anon;
GRANT SELECT (
  id, invoice_number, invoice_type, status, job_card_id, customer_id,
  subtotal_parts, subtotal_labour, subtotal_additional,
  vat_rate, vat_amount, discount_amount, total_amount,
  deposit_percentage, deposit_amount, customer_agreed_at,
  paid_at, payment_method, created_at, updated_at
) ON invoices TO anon;
-- Hidden from the portal: internal_cost_parts, internal_cost_labour,
-- profit_parts, profit_labour, profit_total, profit_margin,
-- payment_reference, notes, created_by, approved_by.
