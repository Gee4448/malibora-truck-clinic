-- =============================================
-- 037: Make an access code enterable in the case it was set in
--
-- The bug: both code screens force what you type to UPPER CASE before it is
-- sent.
--
--   src/pages/StaffGate.jsx   onChange={e => setCode(e.target.value.toUpperCase())}
--   src/pages/RoleUnlock.jsx  onChange={e => setCode(e.target.value.toUpperCase())}
--
-- Neither server function does anything of the kind, and both compare a HASH,
-- which is exact. So a code holding a single lowercase letter can never be
-- entered through the UI at all — you type the right code, the input mangles
-- it, and the screen tells you it is wrong. Forever, with no way to tell that
-- from a genuinely wrong code.
--
-- It has not bitten the staff gate only by luck: that code is 'MALIBORA2025',
-- which is already upper case. Nothing stops the next call to
-- update_staff_code() or admin_set_role_code() from setting 'Malibora@2026'
-- and locking the door with the key still in it.
--
-- The fix, on the server where both paths meet: normalise to upper(trim(...))
-- when STORING and when VERIFYING. What the client sends then always matches
-- the shape of what was stored, whatever case anyone typed when setting it.
--
-- This is backward compatible. Every code currently in use is upper case
-- already, so upper(trim(x)) = x and every existing hash still matches.
--
-- What this does NOT do: it cannot rescue a code that was already stored in
-- mixed case. That hash is of the original string, and hashes are one way —
-- normalising the input just makes it consistently unmatchable instead of
-- accidentally unmatchable. If a code is lost, set a new one (section 3).
--
-- Trade-off, stated plainly: comparing upper-cased input makes these codes
-- case-insensitive, which costs keyspace. It costs nothing that was not
-- already lost — the client has always upper-cased, so no code in this system
-- has ever had a usable lower-case character in it.
--
-- Apply in the Supabase dashboard -> SQL Editor -> Run.
-- =============================================

-- ---------- 1. The staff gate (supabase/staff_access_code.sql) ----------
-- Also adds the SET search_path that the original pair never had. digest()
-- lives in `extensions`, and this project has twice shipped a pgcrypto
-- function that resolved in the SQL editor and failed from PostgREST
-- (migrations 009 and 028). These two have been lucky so far; stop relying on
-- it.
CREATE OR REPLACE FUNCTION verify_staff_code(input_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  stored_hash TEXT;
BEGIN
  SELECT value INTO stored_hash
  FROM staff_settings
  WHERE key = 'staff_access_code';

  IF stored_hash IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN encode(digest(upper(trim(COALESCE(input_code, ''))), 'sha256'), 'hex') = stored_hash;
END;
$$;

CREATE OR REPLACE FUNCTION update_staff_code(new_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_code TEXT := upper(trim(COALESCE(new_code, '')));
BEGIN
  -- The original had no length check at all, and no caller check either: any
  -- signed-in user could reset the gate for the whole company. Both now.
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'manager')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF length(v_code) < 6 THEN
    RAISE EXCEPTION 'code_too_short';
  END IF;

  INSERT INTO staff_settings (key, value)
  VALUES ('staff_access_code', encode(digest(v_code, 'sha256'), 'hex'))
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now();

  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_staff_code(TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION update_staff_code(TEXT) TO authenticated;

-- ---------- 2. The owner / manager role codes (migration 018) ----------
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
  v_code     text := upper(trim(COALESCE(p_code, '')));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT count(*) INTO v_failures
  FROM role_code_redemptions
  WHERE profile_id = v_uid
    AND NOT succeeded
    AND attempted_at > now() - interval '15 minutes';

  IF v_failures >= 10 THEN
    RAISE EXCEPTION 'too_many_attempts';
  END IF;

  IF length(v_code) = 0 THEN
    INSERT INTO role_code_redemptions (profile_id, succeeded) VALUES (v_uid, false);
    RAISE EXCEPTION 'invalid_code';
  END IF;

  FOR v_row IN SELECT * FROM staff_role_codes WHERE active LOOP
    IF v_row.code_hash = crypt(v_code, v_row.code_hash) THEN
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

CREATE OR REPLACE FUNCTION admin_set_role_code(p_role text, p_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_code text := upper(trim(COALESCE(p_code, '')));
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'bad_role';
  END IF;
  IF length(v_code) < 6 THEN
    RAISE EXCEPTION 'code_too_short';
  END IF;

  INSERT INTO staff_role_codes (role, code_hash, active, updated_at)
  VALUES (p_role, crypt(v_code, gen_salt('bf')), true, now())
  ON CONFLICT (role) DO UPDATE
    SET code_hash = EXCLUDED.code_hash, active = true, updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_set_role_code(text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION admin_set_role_code(text, text) TO authenticated;

-- ---------- 3. Set the owner code ----------
-- admin_set_role_code() requires an existing owner, and if nobody is an owner
-- yet there is no way to call it. This runs as the table owner in the SQL
-- editor, so it bypasses that.
--
-- >>> REPLACE THE CODE BELOW BEFORE RUNNING THIS SECTION. <<<
-- Use upper case: section 2 upper-cases on the way in, and so does the UI.
--
-- INSERT INTO staff_role_codes (role, code_hash, active, updated_at)
-- VALUES ('owner', extensions.crypt(upper('PUT-YOUR-CODE-HERE'), extensions.gen_salt('bf')), true, now())
-- ON CONFLICT (role) DO UPDATE
--   SET code_hash = EXCLUDED.code_hash, active = true, updated_at = now();

-- ---------- 4. Check what you have ----------
-- Which codes exist, and when they were last set (never the codes themselves):
--   SELECT role, active, updated_at FROM staff_role_codes;
-- Who is already an owner — you may not need a code at all:
--   SELECT u.email, p.full_name, p.role
--   FROM profiles p JOIN auth.users u ON u.id = p.id
--   WHERE p.role IN ('owner', 'manager');
-- Failed attempts, if the screen keeps refusing you:
--   SELECT * FROM role_code_redemptions ORDER BY attempted_at DESC LIMIT 20;
