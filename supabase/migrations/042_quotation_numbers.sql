-- =============================================
-- 042: A quotation is numbered QUO-, not PRO-
--
-- Antony, 26 Sep 2026, on the first quotation made with 041: "hii naona
-- haiandiki quotation, inaandika proforma" — the document he sends someone
-- who has no job yet should say QUOTATION, and carry a quotation number.
--
-- A quotation is a proforma with no job card (041). The numbering trigger
-- only looked at invoice_type; it now gives QUO-YYYY-NNNN to a proforma that
-- has no job card at the moment it is created. The number never changes
-- afterwards — when "Create job card" links the quotation to a job it keeps
-- its QUO number, because it is the same document the customer already has.
--
-- Apply in the Supabase dashboard -> SQL Editor -> Run.
-- =============================================

CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
  prefix TEXT;
  year_str TEXT;
  next_num INTEGER;
BEGIN
  year_str := TO_CHAR(NOW(), 'YYYY');
  prefix := CASE
    WHEN NEW.invoice_type = 'proforma' AND NEW.job_card_id IS NULL THEN 'QUO'
    WHEN NEW.invoice_type = 'proforma' THEN 'PRO'
    WHEN NEW.invoice_type = 'final' THEN 'INV'
    WHEN NEW.invoice_type = 'internal' THEN 'INT'
  END;

  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM prefix || '-\d{4}-(\d+)') AS INTEGER)), 0) + 1
  INTO next_num
  FROM invoices
  WHERE invoice_number LIKE prefix || '-' || year_str || '-%';

  NEW.invoice_number := prefix || '-' || year_str || '-' || LPAD(next_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The trigger itself (001) is unchanged: BEFORE INSERT, only when no number
-- was supplied.
