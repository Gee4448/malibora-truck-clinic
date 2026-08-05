-- =============================================
-- 028: FIX — "adding a mechanic does nothing" (client report, 5 Aug 2026)
--
-- Cause: the SAME pgcrypto bug migration 009 fixed for the customer functions.
-- admin_save_mechanic() and mechanic_login() (migration 008) are SECURITY
-- DEFINER with `SET search_path = public`, but they call crypt()/gen_salt()
-- from pgcrypto, which on Supabase lives in the `extensions` schema. That
-- schema is not on their search_path, so the bcrypt calls cannot be resolved
-- and every save throws "function gen_salt(unknown) does not exist".
--
-- Migration 009 only repaired register_customer_with_vehicles() and
-- customer_login(); the two mechanic functions were missed and have been
-- broken ever since.
--
-- Fix: recreate both with `SET search_path = public, extensions`. Bodies are
-- byte-for-byte the ones from 008 — only the search_path line changes.
--
-- Apply in the Supabase dashboard -> SQL Editor -> Run.
-- =============================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------- Mechanic login (PIN -> id + name) ----------
CREATE OR REPLACE FUNCTION mechanic_login(p_code text)
RETURNS TABLE(id uuid, name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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

-- ---------- Add / edit a mechanic (owner or manager only) ----------
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
SET search_path = public, extensions
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

-- ---------- Verify ----------
-- Should print "public, extensions" for both:
--   SELECT p.proname, p.proconfig
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname IN ('mechanic_login', 'admin_save_mechanic');
