-- =============================================
-- FEATURE (client req A1): generate a FINAL invoice from an approved PROFORMA,
-- with the final invoice's line items FROZEN at generation time so later edits
-- to the proforma don't mutate an already-issued invoice.
--
-- Source: Antony voice note PTT-20260718-WA0021 (proforma -> invoice flow).
--
-- Design: line items normally live on job_card_items (shared with the job card).
-- A final invoice generated from a proforma gets its own snapshot copy in
-- invoice_items; the invoice page reads/edit those when present, else falls back
-- to job_card_items (so existing invoices keep working unchanged).
--
-- Also fixes a latent RLS gap: job_card_items had SELECT/INSERT/UPDATE policies
-- but NO DELETE policy, so removing a line (delete button / invoice item editor)
-- was silently blocked. Added here.
--
-- Apply in Supabase dashboard -> SQL Editor -> Run.
-- =============================================

-- 1. Snapshot table -------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('part', 'labour', 'additional')),
  description TEXT NOT NULL,
  quantity DECIMAL(8,2) DEFAULT 1,
  cost_price DECIMAL(12,2) DEFAULT 0,
  selling_price DECIMAL(12,2) DEFAULT 0,
  total_cost DECIMAL(12,2) GENERATED ALWAYS AS (quantity * cost_price) STORED,
  total_selling DECIMAL(12,2) GENERATED ALWAYS AS (quantity * selling_price) STORED,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

-- 2. Link a final invoice back to its source proforma ----------------
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS source_proforma_id UUID REFERENCES invoices(id);

-- 3. RLS on invoice_items -------------------------------------------
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth view invoice items" ON invoice_items;
CREATE POLICY "Auth view invoice items" ON invoice_items
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Auth insert invoice items" ON invoice_items;
CREATE POLICY "Auth insert invoice items" ON invoice_items
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Auth update invoice items" ON invoice_items;
CREATE POLICY "Auth update invoice items" ON invoice_items
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Auth delete invoice items" ON invoice_items;
CREATE POLICY "Auth delete invoice items" ON invoice_items
  FOR DELETE TO authenticated USING (true);

-- client portal reads snapshot items for their non-internal invoices
DROP POLICY IF EXISTS "Anon read invoice items" ON invoice_items;
CREATE POLICY "Anon read invoice items" ON invoice_items
  FOR SELECT TO anon USING (
    EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_id AND i.invoice_type <> 'internal')
  );

-- 4. Fix missing DELETE policy on job_card_items --------------------
DROP POLICY IF EXISTS "Staff can delete" ON job_card_items;
CREATE POLICY "Staff can delete" ON job_card_items
  FOR DELETE TO authenticated USING (true);
