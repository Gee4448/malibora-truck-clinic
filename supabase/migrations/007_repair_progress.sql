-- =============================================
-- Repair progress tracking
--
-- Lets a mechanic tick each inspection item as it is fixed and post an overall
-- "current car situation" note. Customers see the fixed / in-progress / pending
-- state and the mechanic's note live in the portal (inspections &
-- inspection_items are already in the supabase_realtime publication).
--
-- Read access for the client portal (anon) is already granted by migration 004
-- (SELECT USING (true) on both tables), so the new columns are visible to
-- customers automatically. Only authenticated staff write these values.
-- =============================================

-- Per-item repair state.
ALTER TABLE inspection_items ADD COLUMN IF NOT EXISTS repair_status text DEFAULT 'pending'
  CHECK (repair_status IN ('pending', 'in_progress', 'done'));
ALTER TABLE inspection_items ADD COLUMN IF NOT EXISTS repair_done_at timestamptz;

-- Overall "current situation" the mechanic posts for the customer.
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS repair_summary text;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS repair_updated_at timestamptz;
