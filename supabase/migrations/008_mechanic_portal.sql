-- =============================================
-- Mechanic PIN portal
--
-- Mechanics are staff but have no email / Supabase Auth account. They sign in
-- to a restricted portal with a personal PIN and see ONLY the job cards
-- assigned to them, where they can tick repair items done and post the
-- "current car situation" the customer sees live.
--
-- Auth model mirrors the client portal: PIN verified by a SECURITY DEFINER RPC,
-- no Supabase session (the portal runs as the anon role). Mechanic writes go
-- through SECURITY DEFINER RPCs that scope every change to the mechanic's own
-- assigned jobs, so the blanket anon UPDATE holes closed in migration 006 are
-- not reopened. Managing mechanics + PINs is restricted to owner/manager.
-- =============================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- 1. Mechanics table ----------
CREATE TABLE IF NOT EXISTS mechanics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  pin_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE mechanics ENABLE ROW LEVEL SECURITY;

-- Only authenticated staff can read/manage the roster (never anon — PIN hashes
-- must stay server-side). The mechanic portal never selects this table; it
-- learns the mechanic's identity only through mechanic_login().
DROP POLICY IF EXISTS "Staff manage mechanics" ON mechanics;
CREATE POLICY "Staff manage mechanics" ON mechanics
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------- 2. Link job cards to a mechanic ----------
ALTER TABLE job_cards ADD COLUMN IF NOT EXISTS assigned_mechanic_id uuid REFERENCES mechanics(id);
CREATE INDEX IF NOT EXISTS idx_job_cards_assigned_mechanic ON job_cards(assigned_mechanic_id);

-- ---------- 3. Mechanic login (PIN -> id + name) ----------
CREATE OR REPLACE FUNCTION mechanic_login(p_code text)
RETURNS TABLE(id uuid, name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m mechanics;
BEGIN
  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RAISE EXCEPTION 'invalid_code';
  END IF;
  FOR m IN SELECT * FROM mechanics WHERE active LOOP
    IF m.pin_hash = crypt(p_code, m.pin_hash) THEN
      id := m.id;
      name := m.name;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'invalid_code';
END;
$$;

GRANT EXECUTE ON FUNCTION mechanic_login(text) TO anon, authenticated;

-- ---------- 4. Manage mechanics (owner/manager only) ----------
-- p_id NULL = create, otherwise update. p_code empty on update keeps the PIN.
CREATE OR REPLACE FUNCTION admin_save_mechanic(
  p_id uuid,
  p_name text,
  p_phone text,
  p_code text,
  p_active boolean
)
RETURNS mechanics
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result mechanics;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'manager')
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_id IS NULL THEN
    IF p_code IS NULL OR length(p_code) < 4 THEN
      RAISE EXCEPTION 'pin_too_short';
    END IF;
    INSERT INTO mechanics (name, phone, pin_hash, active)
    VALUES (p_name, NULLIF(p_phone, ''), crypt(p_code, gen_salt('bf')), COALESCE(p_active, true))
    RETURNING * INTO result;
  ELSE
    UPDATE mechanics SET
      name   = p_name,
      phone  = NULLIF(p_phone, ''),
      active = COALESCE(p_active, active),
      pin_hash = CASE
        WHEN p_code IS NOT NULL AND length(p_code) >= 4 THEN crypt(p_code, gen_salt('bf'))
        ELSE pin_hash
      END
    WHERE id = p_id
    RETURNING * INTO result;
  END IF;

  result.pin_hash := NULL;  -- never leak the hash
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_save_mechanic(uuid, text, text, text, boolean) TO authenticated;

-- ---------- 5. Mechanic writes, scoped to their own assigned jobs ----------
-- Set the repair status of one inspection item, only if that item belongs to a
-- job assigned to this mechanic.
CREATE OR REPLACE FUNCTION mechanic_set_item_repair(
  p_mechanic_id uuid,
  p_item_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('pending', 'in_progress', 'done') THEN
    RAISE EXCEPTION 'bad_status';
  END IF;
  UPDATE inspection_items SET
    repair_status = p_status,
    repair_done_at = CASE WHEN p_status = 'done' THEN now() ELSE NULL END
  WHERE id = p_item_id
    AND inspection_id IN (
      SELECT inspection_id FROM job_cards
      WHERE assigned_mechanic_id = p_mechanic_id AND inspection_id IS NOT NULL
    );
END;
$$;

GRANT EXECUTE ON FUNCTION mechanic_set_item_repair(uuid, uuid, text) TO anon, authenticated;

-- Post the "current car situation" note, only for an inspection tied to one of
-- this mechanic's jobs.
CREATE OR REPLACE FUNCTION mechanic_update_situation(
  p_mechanic_id uuid,
  p_inspection_id uuid,
  p_summary text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE inspections SET
    repair_summary = NULLIF(trim(p_summary), ''),
    repair_updated_at = now()
  WHERE id = p_inspection_id
    AND id IN (
      SELECT inspection_id FROM job_cards WHERE assigned_mechanic_id = p_mechanic_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION mechanic_update_situation(uuid, uuid, text) TO anon, authenticated;

-- Return the jobs assigned to a mechanic (id-scoped) with the fields the portal
-- needs — avoids relying on broad anon SELECT and keeps the payload lean.
CREATE OR REPLACE FUNCTION mechanic_jobs(p_mechanic_id uuid)
RETURNS TABLE(
  id uuid,
  job_number text,
  status text,
  description text,
  created_at timestamptz,
  inspection_id uuid,
  registration_number text,
  make text,
  model text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jc.id, jc.job_number, jc.status, jc.description, jc.created_at,
         jc.inspection_id, v.registration_number, v.make, v.model
  FROM job_cards jc
  LEFT JOIN vehicles v ON v.id = jc.vehicle_id
  WHERE jc.assigned_mechanic_id = p_mechanic_id
  ORDER BY jc.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION mechanic_jobs(uuid) TO anon, authenticated;
