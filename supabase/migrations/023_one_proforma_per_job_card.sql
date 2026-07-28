-- =============================================
-- 023: One proforma per job card
--
-- Client request 28 Jul 2026 (Antony):
--   "every time when the same client create the same proforma invoice, there
--    should not be many separate proforma invoice. There should be only one
--    proforma invoice. If we adjust the details of one proforma, then the
--    information should be available in the updated proforma."
--
-- Apply in the Supabase dashboard -> SQL Editor -> Run.
-- =============================================

-- ---------- 1. Consolidate the proformas that already doubled up ----------
-- JobCardDetail.generateInvoice() ran a plain INSERT, so every press of
-- "Generate Proforma" minted another one. Checked live on 2026-07-28: two job
-- cards were carrying extras (one with three, one with two).
--
-- Nothing is deleted — the extras are marked 'cancelled', which is reversible
-- and keeps their line items, negotiation threads and declared payments intact.
-- The one kept per job card is chosen in this order:
--   1. a proforma that already has a FINAL invoice generated from it (cancelling
--      that one would orphan the final invoice),
--   2. then one the customer has actually seen — anything past 'draft',
--   3. then the most recent, since that is the latest quote.
WITH ranked AS (
  SELECT i.id,
    ROW_NUMBER() OVER (
      PARTITION BY i.job_card_id
      ORDER BY
        (EXISTS (SELECT 1 FROM invoices f WHERE f.source_proforma_id = i.id)) DESC,
        (i.status = 'draft') ASC,
        i.created_at DESC
    ) AS rn
  FROM invoices i
  WHERE i.invoice_type = 'proforma'
    AND i.status <> 'cancelled'
    AND i.job_card_id IS NOT NULL
)
UPDATE invoices i
SET status = 'cancelled'
FROM ranked r
WHERE i.id = r.id AND r.rn > 1;

-- ---------- 2. Stop it happening again, in the database ----------
-- The app now updates the existing proforma instead of inserting a second one,
-- but two staff pressing the button at the same moment would still race past an
-- application-level check. Cancelled ones are excluded so a superseded quote can
-- sit in the history without blocking a fresh one.
--
-- job_card_id IS NULL rows are unaffected: NULLs are distinct in a unique index.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_live_proforma_per_job_card
  ON invoices (job_card_id)
  WHERE invoice_type = 'proforma' AND status <> 'cancelled';
