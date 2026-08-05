-- =============================================
-- 030: The mechanic ticks the job finished, and shows proof
--
-- Client request 5 Aug 2026 (voice note 12.42.04):
--   "there are mechanics working over there — when he finishes his work he
--    should tick it ... that the work was done, it's finished. Once it's
--    finished, the business is done. And also he should be able to put
--    evidence that the work is finished — like if it's fitting something,
--    it's fitted, it's fresh. He should be able to put [photos]."
--
-- Two pieces:
--   1. job_cards.mechanic_completed_at/_by + mechanic_complete_job(), the tick.
--   2. job_evidence + a storage bucket, the photos.
--
-- Trust model note: the mechanic portal has no Supabase Auth session — it is
-- PIN-only (migration 008), so these functions are granted to anon and every
-- one of them re-checks that the job really is assigned to the mechanic id it
-- was handed, exactly like mechanic_set_item_repair does.
--
-- Apply in the Supabase dashboard -> SQL Editor -> Run.
-- =============================================

-- ---------- 1. The tick ----------
ALTER TABLE job_cards ADD COLUMN IF NOT EXISTS mechanic_completed_at timestamptz;
ALTER TABLE job_cards ADD COLUMN IF NOT EXISTS mechanic_completed_by uuid REFERENCES mechanics(id);

-- Marks the work finished. Also closes the job card itself, but only from a
-- status that means "being worked on" — a card still waiting for a quote or
-- for the customer's approval must not be closed from the workshop floor.
CREATE OR REPLACE FUNCTION mechanic_complete_job(
  p_mechanic_id uuid,
  p_job_card_id uuid,
  p_note        text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_job      job_cards;
  v_mechanic text;
BEGIN
  SELECT * INTO v_job FROM job_cards
   WHERE id = p_job_card_id AND assigned_mechanic_id = p_mechanic_id;

  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'not_your_job';
  END IF;

  SELECT name INTO v_mechanic FROM mechanics WHERE id = p_mechanic_id;

  UPDATE job_cards SET
    mechanic_completed_at = now(),
    mechanic_completed_by = p_mechanic_id,
    status = CASE WHEN status IN ('open', 'in_progress', 'waiting_parts')
                  THEN 'completed' ELSE status END,
    date_completed = CASE WHEN status IN ('open', 'in_progress', 'waiting_parts')
                          THEN now() ELSE date_completed END
  WHERE id = p_job_card_id;

  -- Tell the office. The dashboard already listens on this table (migration 015).
  INSERT INTO notifications (type, title, body, job_card_id, customer_id)
  VALUES (
    'work_completed',
    COALESCE(v_mechanic, 'Mechanic') || ' finished ' || COALESCE(v_job.job_number, 'a job'),
    NULLIF(trim(COALESCE(p_note, '')), ''),
    p_job_card_id,
    v_job.customer_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION mechanic_complete_job(uuid, uuid, text) TO anon, authenticated;

-- Undo, for the case where the wrong job got ticked. Staff can also reopen a
-- job card from the office (JobCardDetail).
CREATE OR REPLACE FUNCTION mechanic_reopen_job(
  p_mechanic_id uuid,
  p_job_card_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM job_cards
     WHERE id = p_job_card_id AND assigned_mechanic_id = p_mechanic_id
  ) THEN
    RAISE EXCEPTION 'not_your_job';
  END IF;

  UPDATE job_cards SET
    mechanic_completed_at = NULL,
    mechanic_completed_by = NULL,
    status = CASE WHEN status = 'completed' THEN 'in_progress' ELSE status END,
    date_completed = CASE WHEN status = 'completed' THEN NULL ELSE date_completed END
  WHERE id = p_job_card_id;
END;
$$;

GRANT EXECUTE ON FUNCTION mechanic_reopen_job(uuid, uuid) TO anon, authenticated;

-- ---------- 2. Evidence photos ----------
-- One row per uploaded photo. `storage_path` is the object key inside the
-- `job-evidence` bucket; the file itself lives in Supabase Storage.
CREATE TABLE IF NOT EXISTS job_evidence (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_card_id         uuid NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
  inspection_item_id  uuid REFERENCES inspection_items(id) ON DELETE SET NULL,
  mechanic_id         uuid REFERENCES mechanics(id) ON DELETE SET NULL,
  storage_path        text NOT NULL,
  caption             text,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_evidence_job ON job_evidence(job_card_id, created_at DESC);

ALTER TABLE job_evidence ENABLE ROW LEVEL SECURITY;

-- Staff see everything.
DROP POLICY IF EXISTS "Staff read evidence" ON job_evidence;
CREATE POLICY "Staff read evidence" ON job_evidence
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff delete evidence" ON job_evidence;
CREATE POLICY "Staff delete evidence" ON job_evidence
  FOR DELETE TO authenticated USING (true);

-- The mechanic portal and the customer portal are both anon, and the point of
-- the photo is that the customer can see it. Writes do NOT go through this
-- policy — they go through mechanic_add_evidence(), which checks the job
-- assignment — so anon gets read only.
DROP POLICY IF EXISTS "Portal reads evidence" ON job_evidence;
CREATE POLICY "Portal reads evidence" ON job_evidence
  FOR SELECT TO anon USING (true);

GRANT SELECT ON job_evidence TO anon;

-- Record an uploaded photo against a job, if it really is this mechanic's job.
CREATE OR REPLACE FUNCTION mechanic_add_evidence(
  p_mechanic_id uuid,
  p_job_card_id uuid,
  p_path        text,
  p_caption     text DEFAULT NULL,
  p_item_id     uuid DEFAULT NULL
)
RETURNS job_evidence
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  result job_evidence;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM job_cards
     WHERE id = p_job_card_id AND assigned_mechanic_id = p_mechanic_id
  ) THEN
    RAISE EXCEPTION 'not_your_job';
  END IF;

  IF p_path IS NULL OR length(trim(p_path)) = 0 THEN
    RAISE EXCEPTION 'missing_path';
  END IF;

  INSERT INTO job_evidence (job_card_id, inspection_item_id, mechanic_id, storage_path, caption)
  VALUES (p_job_card_id, p_item_id, p_mechanic_id, trim(p_path),
          NULLIF(trim(COALESCE(p_caption, '')), ''))
  RETURNING * INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION mechanic_add_evidence(uuid, uuid, text, text, uuid) TO anon, authenticated;

-- A mechanic may remove a photo he uploaded himself (wrong picture, blurry).
CREATE OR REPLACE FUNCTION mechanic_delete_evidence(
  p_mechanic_id uuid,
  p_evidence_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  DELETE FROM job_evidence
   WHERE id = p_evidence_id AND mechanic_id = p_mechanic_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_yours';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION mechanic_delete_evidence(uuid, uuid) TO anon, authenticated;

-- ---------- 3. The storage bucket ----------
-- Public-read: the mechanic portal, the office and the customer portal all
-- need to display these, and two of the three run unauthenticated, so a
-- signed-URL scheme would buy nothing. Object keys are
-- <job_card_id>/<uuid>.jpg, so they cannot be guessed or enumerated.
INSERT INTO storage.buckets (id, name, public)
VALUES ('job-evidence', 'job-evidence', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Evidence is readable" ON storage.objects;
CREATE POLICY "Evidence is readable" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'job-evidence');

DROP POLICY IF EXISTS "Portal uploads evidence" ON storage.objects;
CREATE POLICY "Portal uploads evidence" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'job-evidence');

DROP POLICY IF EXISTS "Staff clears evidence" ON storage.objects;
CREATE POLICY "Staff clears evidence" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'job-evidence');
