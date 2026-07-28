-- =============================================
-- 025: Re-derive the proforma totals that were already stale
--
-- Migration 023 / syncProformaTotals fixed this going FORWARD: from now on a
-- job-card edit refreshes its proforma. It did nothing for the proformas that
-- had already drifted, and those are the ones on screen today.
--
-- Found on 2026-07-29 while chasing "there's no option for the client to pay":
-- PRO-2026-0003 stored total 0 while its job card holds a 55,000 part. The
-- portal hides the Pay button when the balance is zero, so a quote that had
-- silently lost its price also lost its pay button — the reported symptom.
--
--   PRO-2026-0003      0  ->   64,900   (job card gained a part after quoting)
--   PRO-2026-0005 902,700  ->  135,700  (job card lost items after quoting)
--
-- The job card is the source of truth: a proforma's LINE ITEMS have always been
-- read live from job_card_items, so the stored totals are the only half that
-- can go stale, and they are the half being corrected here.
--
-- Restricted to draft/sent/negotiating. A proforma the customer has approved,
-- part-paid or paid is not ours to re-price — same rule the app enforces.
--
-- Apply in the Supabase dashboard -> SQL Editor -> Run.
-- =============================================

WITH s AS (
  SELECT i.id,
    COALESCE((SELECT SUM(j.total_selling) FROM job_card_items j
              WHERE j.job_card_id = i.job_card_id AND j.item_type = 'part'), 0)       AS sp,
    COALESCE((SELECT SUM(j.total_selling) FROM job_card_items j
              WHERE j.job_card_id = i.job_card_id AND j.item_type = 'labour'), 0)     AS sl,
    COALESCE((SELECT SUM(j.total_selling) FROM job_card_items j
              WHERE j.job_card_id = i.job_card_id AND j.item_type = 'additional'), 0) AS sa,
    COALESCE((SELECT SUM(j.total_cost) FROM job_card_items j
              WHERE j.job_card_id = i.job_card_id AND j.item_type = 'part'), 0)       AS cp,
    COALESCE((SELECT SUM(j.total_cost) FROM job_card_items j
              WHERE j.job_card_id = i.job_card_id AND j.item_type = 'labour'), 0)     AS cl,
    -- The invoice's OWN rate: VAT is per-invoice since migration 012, and
    -- forcing everything back to 18% would undo deliberate changes.
    COALESCE(i.vat_rate, 18) AS rate
  FROM invoices i
  WHERE i.invoice_type = 'proforma'
    AND i.status IN ('draft', 'sent', 'negotiating')
    AND i.job_card_id IS NOT NULL
)
UPDATE invoices i SET
  subtotal_parts      = s.sp,
  subtotal_labour     = s.sl,
  subtotal_additional = s.sa,
  vat_amount          = (s.sp + s.sl + s.sa) * s.rate / 100,
  total_amount        = (s.sp + s.sl + s.sa) + (s.sp + s.sl + s.sa) * s.rate / 100,
  internal_cost_parts = s.cp,
  internal_cost_labour= s.cl,
  profit_parts        = s.sp - s.cp,
  profit_labour       = s.sl - s.cl,
  -- Profit is measured against the PRE-VAT subtotal: VAT is collected for the
  -- TRA and passed on, so counting it as profit overstates every job.
  profit_total        = (s.sp + s.sl + s.sa) - s.cp - s.cl,
  profit_margin       = CASE WHEN (s.sp + s.sl + s.sa) > 0
                          THEN ((s.sp + s.sl + s.sa) - s.cp - s.cl) / (s.sp + s.sl + s.sa) * 100
                          ELSE 0 END
FROM s
WHERE i.id = s.id;
