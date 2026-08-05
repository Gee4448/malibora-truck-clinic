-- =============================================
-- 032: The mechanic reports a fault he finds in the field
--
-- Client request 5 Aug 2026 (follow-up): "the mechanic finds a part the
-- customer didn't mention — maybe the rear wheel is faulty — he should be able
-- to add that and send it back to the office."
--
-- Half of this already existed: when the OFFICE adds an item to a job that is
-- in progress, it is flagged is_additional with approval_status 'pending' and
-- goes through a manager and then the customer (JobCardDetail.jsx). What was
-- missing is the entry point where the fault is actually found. Today the
-- mechanic phones the office and someone retypes it.
--
-- The mechanic files a FINDING, not a priced line. He never sets prices: cost
-- and margin are internal, and the mechanic portal is unauthenticated. The
-- office prices the finding into the job, and the existing approval flow takes
-- over unchanged. This mirrors how shop systems generally work — technician
-- raises, advisor prices, customer authorises.
--
-- Keyed on job_card_id, deliberately, NOT on the inspection: a job card raised
-- directly has no inspection, and those findings must not fall on the floor.
--
-- Apply in the Supabase dashboard -> SQL Editor -> Run.
-- =============================================

CREATE TABLE IF NOT EXISTS job_findings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_card_id      uuid NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
  mechanic_id      uuid REFERENCES mechanics(id) ON DELETE SET NULL,
  description      text NOT NULL,
  severity         text NOT NULL DEFAULT 'medium'
                     CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'accepted', 'declined')),
  evidence_path    text,      -- optional photo, same `job-evidence` bucket
  job_card_item_id uuid REFERENCES job_card_items(id) ON DELETE SET NULL,
  reviewed_by      uuid REFERENCES profiles(id),
  reviewed_at      timestamptz,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_findings_job    ON job_findings(job_card_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_findings_status ON job_findings(status) WHERE status = 'pending';

ALTER TABLE job_findings ENABLE ROW LEVEL SECURITY;

-- Staff read them and act on them.
DROP POLICY IF EXISTS "Staff read findings" ON job_findings;
CREATE POLICY "Staff read findings" ON job_findings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff review findings" ON job_findings;
CREATE POLICY "Staff review findings" ON job_findings
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- The mechanic portal is anon and needs to see what he filed and how it went.
-- Writes do NOT go through here — they go through the RPC below, which checks
-- the job is really his.
DROP POLICY IF EXISTS "Portal reads findings" ON job_findings;
CREATE POLICY "Portal reads findings" ON job_findings
  FOR SELECT TO anon USING (true);

GRANT SELECT ON job_findings TO anon;

-- ---------- File a finding ----------
CREATE OR REPLACE FUNCTION mechanic_report_finding(
  p_mechanic_id   uuid,
  p_job_card_id   uuid,
  p_description   text,
  p_severity      text DEFAULT 'medium',
  p_evidence_path text DEFAULT NULL
)
RETURNS job_findings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_job      job_cards;
  v_mechanic text;
  result     job_findings;
BEGIN
  SELECT * INTO v_job FROM job_cards
   WHERE id = p_job_card_id AND assigned_mechanic_id = p_mechanic_id;

  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'not_your_job';
  END IF;

  IF p_description IS NULL OR length(trim(p_description)) = 0 THEN
    RAISE EXCEPTION 'description_required';
  END IF;

  IF p_severity NOT IN ('low', 'medium', 'high', 'critical') THEN
    RAISE EXCEPTION 'bad_severity';
  END IF;

  SELECT name INTO v_mechanic FROM mechanics WHERE id = p_mechanic_id;

  INSERT INTO job_findings (job_card_id, mechanic_id, description, severity, evidence_path)
  VALUES (p_job_card_id, p_mechanic_id, trim(p_description), p_severity,
          NULLIF(trim(COALESCE(p_evidence_path, '')), ''))
  RETURNING * INTO result;

  -- The office dashboard already listens on notifications (migration 015).
  INSERT INTO notifications (type, title, body, job_card_id, customer_id)
  VALUES (
    'fault_reported',
    COALESCE(v_mechanic, 'A mechanic') || ' found a fault on ' || COALESCE(v_job.job_number, 'a job'),
    trim(p_description),
    p_job_card_id,
    v_job.customer_id
  );

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION mechanic_report_finding(uuid, uuid, text, text, text) TO anon, authenticated;

-- ---------- Withdraw one, while the office has not acted on it ----------
CREATE OR REPLACE FUNCTION mechanic_delete_finding(
  p_mechanic_id uuid,
  p_finding_id  uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  DELETE FROM job_findings
   WHERE id = p_finding_id
     AND mechanic_id = p_mechanic_id
     AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_yours_or_reviewed';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION mechanic_delete_finding(uuid, uuid) TO anon, authenticated;
