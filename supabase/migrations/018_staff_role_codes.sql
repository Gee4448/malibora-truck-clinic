-- =============================================
-- 018: Owner / Manager role codes
--
-- Client request 28 Jul 2026: a code that a signed-in staff member enters once
-- to become owner or manager, landing them on the dashboard with Reports and
-- the profit figures visible.
--
-- Why this exists: accounts are auto-created as 'receptionist'
-- (src/contexts/AuthContext.jsx), internal costs are gated on role
-- IN ('owner','manager'), and Settings shows the role read-only. Until now the
-- only way to promote someone was hand-written SQL.
--
-- Security model: the code is redeemed by an ALREADY AUTHENTICATED user and
-- only ever changes that user's own role. It is not a login — there is no path
-- here to reach data without a Supabase session, so the anon lockdown from
-- migration 006/010 is untouched. Hashes are bcrypt (matching the mechanic PIN
-- in 008), never the unsalted SHA-256 the old staff gate uses.
--
-- >>> BEFORE RUNNING: replace the two codes in section 5. <<<
--
-- Apply in the Supabase dashboard -> SQL Editor -> Run.
-- =============================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- 1. The codes: one row per grantable role ----------
CREATE TABLE IF NOT EXISTS staff_role_codes (
  role       text PRIMARY KEY CHECK (role IN ('owner', 'manager')),
  code_hash  text NOT NULL,
  active     boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE staff_role_codes ENABLE ROW LEVEL SECURITY;
-- No policy is created on purpose: with RLS on and no policy, nothing reaches
-- this table through PostgREST for any role. The hashes are only ever touched
-- by the SECURITY DEFINER functions below. anon has no grants here at all.
REVOKE ALL ON staff_role_codes FROM anon, authenticated;

-- ---------- 2. Audit trail ----------
-- Every attempt, successful or not. Doubles as the rate-limit source below, and
-- answers "who promoted themselves and when" — important for a shared code.
CREATE TABLE IF NOT EXISTS role_code_redemptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   uuid REFERENCES profiles(id),
  role_granted text,           -- NULL when the attempt failed
  succeeded    boolean NOT NULL,
  attempted_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_role_code_redemptions_profile
  ON role_code_redemptions(profile_id, attempted_at DESC);

ALTER TABLE role_code_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON role_code_redemptions FROM anon;

-- Owners may review the log; nobody can write to it directly (only the
-- SECURITY DEFINER function below inserts).
DROP POLICY IF EXISTS "Owners read redemption log" ON role_code_redemptions;
CREATE POLICY "Owners read redemption log" ON role_code_redemptions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'));

-- ---------- 3. Redeem a code ----------
-- Returns the granted role. Raises: not_authenticated / too_many_attempts /
-- invalid_code. Promotes ONLY the caller, and never demotes an existing owner.
CREATE OR REPLACE FUNCTION redeem_role_code(p_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_failures integer;
  v_row      staff_role_codes;
  v_current  text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Server-side lockout: a shared code is guessable, so cap the guess rate.
  -- Client-side attempt counters are trivially bypassed.
  SELECT count(*) INTO v_failures
  FROM role_code_redemptions
  WHERE profile_id = v_uid
    AND NOT succeeded
    AND attempted_at > now() - interval '15 minutes';

  IF v_failures >= 10 THEN
    RAISE EXCEPTION 'too_many_attempts';
  END IF;

  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    INSERT INTO role_code_redemptions (profile_id, succeeded) VALUES (v_uid, false);
    RAISE EXCEPTION 'invalid_code';
  END IF;

  -- bcrypt hashes are salted, so every candidate must be compared in turn.
  FOR v_row IN SELECT * FROM staff_role_codes WHERE active LOOP
    IF v_row.code_hash = crypt(trim(p_code), v_row.code_hash) THEN
      SELECT role INTO v_current FROM profiles WHERE id = v_uid;

      -- Never let a manager code silently demote an owner.
      IF v_current = 'owner' AND v_row.role = 'manager' THEN
        INSERT INTO role_code_redemptions (profile_id, role_granted, succeeded)
        VALUES (v_uid, v_current, true);
        RETURN v_current;
      END IF;

      UPDATE profiles SET role = v_row.role WHERE id = v_uid;

      INSERT INTO role_code_redemptions (profile_id, role_granted, succeeded)
      VALUES (v_uid, v_row.role, true);

      RETURN v_row.role;
    END IF;
  END LOOP;

  INSERT INTO role_code_redemptions (profile_id, succeeded) VALUES (v_uid, false);
  RAISE EXCEPTION 'invalid_code';
END;
$$;

REVOKE EXECUTE ON FUNCTION redeem_role_code(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION redeem_role_code(text) TO authenticated;

-- ---------- 4. Rotate a code (owner only) ----------
CREATE OR REPLACE FUNCTION admin_set_role_code(p_role text, p_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'bad_role';
  END IF;
  IF p_code IS NULL OR length(trim(p_code)) < 6 THEN
    RAISE EXCEPTION 'code_too_short';
  END IF;

  INSERT INTO staff_role_codes (role, code_hash, active, updated_at)
  VALUES (p_role, crypt(trim(p_code), gen_salt('bf')), true, now())
  ON CONFLICT (role) DO UPDATE
    SET code_hash = EXCLUDED.code_hash, active = true, updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_set_role_code(text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION admin_set_role_code(text, text) TO authenticated;

-- ---------- 5. Seed the initial codes ----------
-- >>> REPLACE BOTH VALUES BEFORE RUNNING. <<<
-- These are the codes staff will type in. Chicken-and-egg: admin_set_role_code
-- requires an existing owner, and there may not be one yet, so the first pair
-- is seeded here. Rotate later with:
--   SELECT admin_set_role_code('manager', 'NEW-CODE-HERE');
INSERT INTO staff_role_codes (role, code_hash, active) VALUES
  ('owner',   crypt('CHANGE-ME-OWNER-CODE',   gen_salt('bf')), true),
  ('manager', crypt('CHANGE-ME-MANAGER-CODE', gen_salt('bf')), true)
ON CONFLICT (role) DO NOTHING;

-- ---------- 6. Review ----------
-- Who holds what role:
--   SELECT u.email, p.full_name, p.role
--   FROM profiles p JOIN auth.users u ON u.id = p.id ORDER BY p.role;
-- Who has redeemed a code:
--   SELECT * FROM role_code_redemptions ORDER BY attempted_at DESC LIMIT 20;
