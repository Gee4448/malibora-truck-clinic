-- =============================================
-- 034: Labour-time tracking (gap G1 vs the Odoo/Probuse garage app)
--
-- Mechanics log the HOURS they spend on a job; the office attaches a RATE and
-- turns logged hours into a billable labour line. This is what lets the owner
-- see true per-job profit (labour was invisible in cost before) and, later,
-- measure mechanic productivity.
--
-- THE INVARIANT THIS PRESERVES: the mechanic portal is `anon` + PIN and a
-- mechanic must never see or set a price (same rule as the fault-report flow,
-- migration 032). So `labour_entries` holds HOURS ONLY — no money column exists
-- on it. The price lives on the job_card_items labour line the office creates.
--
-- Auth model mirrors migrations 008/030/032: portal writes go through
-- SECURITY DEFINER RPCs that re-check the job really is assigned to the mechanic
-- id handed in. The office bills labour with ordinary authenticated writes,
-- exactly like it already adds parts/labour lines in JobCardDetail.jsx.
--
-- Apply in the Supabase dashboard -> SQL Editor -> Run.
-- =============================================

-- ---------- 1. The time ledger (no price, ever) ----------
CREATE TABLE IF NOT EXISTS labour_entries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_card_id      uuid NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
  mechanic_id      uuid REFERENCES mechanics(id) ON DELETE SET NULL,
  hours            numeric(6,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
  note             text,
  work_date        date NOT NULL DEFAULT current_date,
  -- Once the office rolls these hours into a labour line they are `billed`, so
  -- they are not billed a second time. The link records which line took them.
  billed           boolean NOT NULL DEFAULT false,
  job_card_item_id uuid REFERENCES job_card_items(id) ON DELETE SET NULL,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_labour_entries_job  ON labour_entries(job_card_id);
CREATE INDEX IF NOT EXISTS idx_labour_entries_mech ON labour_entries(mechanic_id, work_date);

ALTER TABLE labour_entries ENABLE ROW LEVEL SECURITY;

-- Staff read + manage everything (the office panel and Reports use this).
-- Portal (anon) writes go through the RPCs below, never this policy, so there is
-- deliberately no anon policy here.
DROP POLICY IF EXISTS "Staff read labour" ON labour_entries;
CREATE POLICY "Staff read labour" ON labour_entries
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff manage labour" ON labour_entries;
CREATE POLICY "Staff manage labour" ON labour_entries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------- 2. Mechanic logs time against their own job ----------
-- No price crosses this boundary — hours only.
CREATE OR REPLACE FUNCTION mechanic_log_labour(
  p_mechanic_id uuid,
  p_job_card_id uuid,
  p_hours       numeric,
  p_note        text DEFAULT NULL
)
RETURNS labour_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  result labour_entries;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM job_cards
     WHERE id = p_job_card_id AND assigned_mechanic_id = p_mechanic_id
  ) THEN
    RAISE EXCEPTION 'not_your_job';
  END IF;

  IF p_hours IS NULL OR p_hours <= 0 OR p_hours > 24 THEN
    RAISE EXCEPTION 'bad_hours';
  END IF;

  INSERT INTO labour_entries (job_card_id, mechanic_id, hours, note)
  VALUES (p_job_card_id, p_mechanic_id, p_hours,
          NULLIF(trim(COALESCE(p_note, '')), ''))
  RETURNING * INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION mechanic_log_labour(uuid, uuid, numeric, text) TO anon, authenticated;

-- ---------- 3. Mechanic reads their own entries for a job ----------
-- The portal can't SELECT the table directly (no anon policy), so it reads
-- through this id-scoped function.
CREATE OR REPLACE FUNCTION mechanic_labour(
  p_mechanic_id uuid,
  p_job_card_id uuid
)
RETURNS SETOF labour_entries
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT le.*
  FROM labour_entries le
  JOIN job_cards jc ON jc.id = le.job_card_id
  WHERE le.job_card_id = p_job_card_id
    AND jc.assigned_mechanic_id = p_mechanic_id
  ORDER BY le.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION mechanic_labour(uuid, uuid) TO anon, authenticated;

-- ---------- 4. Mechanic removes their own entry, while unbilled ----------
-- Once the office has billed the hours the mechanic can no longer pull them,
-- or the labour line and the ledger would disagree.
CREATE OR REPLACE FUNCTION mechanic_delete_labour(
  p_mechanic_id uuid,
  p_entry_id    uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM labour_entries
   WHERE id = p_entry_id
     AND mechanic_id = p_mechanic_id
     AND billed = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_yours_or_billed';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION mechanic_delete_labour(uuid, uuid) TO anon, authenticated;

-- ---------- 5. Realtime (optional but cheap) ----------
-- So the office panel updates live when a mechanic logs time while it's open,
-- the same way the dashboard listens on notifications (migration 022).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'labour_entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE labour_entries;
  END IF;
END $$;
