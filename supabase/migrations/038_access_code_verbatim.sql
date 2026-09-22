-- =============================================
-- 038: Accept the code exactly as it was set — supersedes 037
--
-- 037 was the wrong fix and this replaces it. Run this whether or not you ran
-- 037; everything here is CREATE OR REPLACE and lands on top either way.
--
-- What 037 got right: both code inputs force what you type to UPPER CASE
-- before sending it, while the server compares an exact hash. So a code with a
-- lowercase letter in it cannot be entered through the UI at all.
--
-- What 037 got WRONG: it "fixed" this by upper-casing on the server too. That
-- makes the mangling consistent instead of undoing it. If your code was stored
-- as 'Malibora@2026', the stored hash is of that exact string — upper-casing
-- the input just produces 'MALIBORA@2026' every time and the code stays
-- permanently unusable. 037 made a lost code lost forever and called it a fix.
--
-- The actual fix has two halves:
--
--   1. The CLIENT stops transforming the input (this commit). The server then
--      sees exactly what was typed, so a mixed-case code matches its hash.
--
--   2. The SERVER tries the input BOTH ways — verbatim first, then
--      upper-cased. The upper-cased attempt exists only so that codes stored
--      upper-case (every one in use today) keep working for someone who types
--      them in lower case, which the client's upper-casing has silently been
--      doing for them until now. Removing half 1 without half 2 would break
--      every user who types 'malibora2025'.
--
-- Codes are STORED verbatim, not normalised. A code set in mixed case is
-- matched by the verbatim attempt; a code set in upper case is matched by
-- either. Nothing that works today stops working.
--
-- Apply in the Supabase dashboard -> SQL Editor -> Run.
-- =============================================

-- ---------- 1. The staff gate ----------
CREATE OR REPLACE FUNCTION verify_staff_code(input_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  stored_hash TEXT;
  v_code      TEXT := trim(COALESCE(input_code, ''));
BEGIN
  SELECT value INTO stored_hash
  FROM staff_settings
  WHERE key = 'staff_access_code';

  IF stored_hash IS NULL OR length(v_code) = 0 THEN
    RETURN FALSE;
  END IF;

  RETURN encode(digest(v_code, 'sha256'), 'hex') = stored_hash
      OR encode(digest(upper(v_code), 'sha256'), 'hex') = stored_hash;
END;
$$;

-- Stored verbatim. 037 upper-cased here; it should not have.
CREATE OR REPLACE FUNCTION update_staff_code(new_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_code TEXT := trim(COALESCE(new_code, ''));
BEGIN
  -- Kept from 037: the original had neither check, so any signed-in user could
  -- reset the gate for the whole company, with a code of any length including
  -- the empty string.
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

-- ---------- 2. The owner / manager role codes ----------
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
  v_code     text := trim(COALESCE(p_code, ''));
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

  -- Verbatim first, then upper-cased. bcrypt is salted, so each candidate has
  -- to be compared against each row in turn; at two rows and two candidates
  -- that is four hashes on a failed attempt, which is the point of the
  -- lockout above.
  FOR v_row IN SELECT * FROM staff_role_codes WHERE active LOOP
    IF v_row.code_hash = crypt(v_code, v_row.code_hash)
       OR v_row.code_hash = crypt(upper(v_code), v_row.code_hash) THEN
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

-- Stored verbatim. 037 upper-cased here too.
CREATE OR REPLACE FUNCTION admin_set_role_code(p_role text, p_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_code text := trim(COALESCE(p_code, ''));
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

-- ---------- 3. Why is my code being refused? ----------
-- Run this FIRST, before changing anything. It tests your code against the
-- stored hash directly, the same way the function does, and tells you which
-- form matches. Nothing is written and the code is not stored anywhere.
--
--   SELECT role,
--          active,
--          code_hash = extensions.crypt('YOUR CODE HERE', code_hash)        AS matches_verbatim,
--          code_hash = extensions.crypt(upper('YOUR CODE HERE'), code_hash) AS matches_uppercased,
--          length('YOUR CODE HERE')                                         AS code_length,
--          updated_at
--   FROM staff_role_codes;
--
-- Reading the result:
--   matches_verbatim = true, matches_uppercased = false
--       -> your code has lower case in it. This migration plus the client
--          change is exactly your fix. Nothing else to do.
--   matches_uppercased = true
--       -> the code works; something else is refusing you. Check `active` is
--          true, and check the attempt log below for `too_many_attempts` —
--          ten failures in fifteen minutes locks you out, and every further
--          try fails no matter how right it is. Wait it out.
--   both false
--       -> that is not the stored code. Set a new one (section 4).
--   no rows at all
--       -> no code was ever seeded. Set one (section 4).
--
-- The attempt log, which says which of those you have been hitting:
--   SELECT p.full_name, r.succeeded, r.role_granted, r.attempted_at
--   FROM role_code_redemptions r LEFT JOIN profiles p ON p.id = r.profile_id
--   ORDER BY r.attempted_at DESC LIMIT 20;

-- ---------- 4. Set a new owner code ----------
-- Only if section 3 says both forms are false, or there are no rows.
-- admin_set_role_code() needs an existing owner; in the SQL editor you are the
-- table owner, so this works when that does not.
--
-- >>> REPLACE THE CODE BEFORE RUNNING. Any case you like now. <<<
--
-- INSERT INTO staff_role_codes (role, code_hash, active, updated_at)
-- VALUES ('owner', extensions.crypt('PUT-YOUR-CODE-HERE', extensions.gen_salt('bf')), true, now())
-- ON CONFLICT (role) DO UPDATE
--   SET code_hash = EXCLUDED.code_hash, active = true, updated_at = now();
--
-- Or skip codes entirely and just make yourself owner:
--
-- UPDATE profiles SET role = 'owner'
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'you@example.com');
