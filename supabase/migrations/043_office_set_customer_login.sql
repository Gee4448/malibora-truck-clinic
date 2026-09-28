-- =============================================
-- 043: The office gives a customer their portal login
--
-- Client request 28 Sep 2026 (Antony, voice note + chat): "when we register a
-- new customer at the office, shouldn't we give him a password and username,
-- so that when he later opens his account he can carry on with them or change
-- them" — and, when a customer forgets the password after a long time away,
-- he should be able to phone the office and be helped on the spot.
--
-- Until now a walk-in was saved with no password at all. Only someone who
-- registered online had one, and nobody could set or replace it afterwards.
--
--   1. admin_set_customer_password()  staff set, or reset, a customer's password
--   2. customer_change_password()     the customer changes it from the portal
--   3. customer_login()               matches the phone by its digits, so a
--                                     number the office typed as "0712 345 678"
--                                     still signs in as 0712345678 / +255712345678
--
-- The password is stored only as a bcrypt hash, exactly as online sign-ups
-- already are. A forgotten password is therefore REPLACED by the office, not
-- read back: the customer gets a new one over the phone in the same call.
--
-- The username is the customer's phone number — that is what the portal login
-- has always asked for.
--
-- Not a deploy blocker for the rest of the app: without this migration only
-- the new "portal login" actions fail, with a message saying it is missing.
--
-- Apply in the Supabase dashboard -> SQL Editor -> Run.
-- =============================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------- phone digits, in the one form we compare on ----------
-- "0712 345 678", "+255 712 345 678", "255712345678", "712345678" -> 255712345678
CREATE OR REPLACE FUNCTION normalize_tz_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digits text;
BEGIN
  digits := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
  IF digits LIKE '0%' THEN
    digits := '255' || substring(digits FROM 2);
  ELSIF length(digits) = 9 THEN
    digits := '255' || digits;
  END IF;
  RETURN digits;
END;
$$;

-- ---------- 1. staff set / reset a customer's password ----------
CREATE OR REPLACE FUNCTION admin_set_customer_password(
  p_customer_id uuid,
  p_password text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
-- `extensions` MUST be on the path so crypt()/gen_salt() (pgcrypto) resolve.
SET search_path = public, extensions
AS $$
BEGIN
  -- Any active staff member: registering customers is front-desk work.
  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE profiles.id = auth.uid() AND COALESCE(profiles.is_active, true)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION 'password_too_short';
  END IF;

  UPDATE customers
     SET password_hash = crypt(p_password, gen_salt('bf'))
   WHERE id = p_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_set_customer_password(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION admin_set_customer_password(uuid, text) TO authenticated;

-- ---------- 2. the customer changes their own password ----------
-- The portal runs as `anon`, so knowing the current password is the proof of
-- who is asking. An account that never had one (an old walk-in) may set its
-- first password without it.
CREATE OR REPLACE FUNCTION customer_change_password(
  p_customer_id uuid,
  p_old_password text,
  p_new_password text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  matched customers;
BEGIN
  SELECT * INTO matched FROM customers WHERE id = p_customer_id;

  IF matched.id IS NULL OR matched.status <> 'approved' THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF matched.password_hash IS NOT NULL THEN
    IF p_old_password IS NULL
       OR length(p_old_password) = 0
       OR matched.password_hash <> crypt(p_old_password, matched.password_hash) THEN
      RAISE EXCEPTION 'wrong_password';
    END IF;
  END IF;

  IF p_new_password IS NULL OR length(p_new_password) < 6 THEN
    RAISE EXCEPTION 'password_too_short';
  END IF;

  UPDATE customers
     SET password_hash = crypt(p_new_password, gen_salt('bf'))
   WHERE id = p_customer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION customer_change_password(uuid, text, text) TO anon;
GRANT EXECUTE ON FUNCTION customer_change_password(uuid, text, text) TO authenticated;

-- ---------- 3. login: same body as 009, phone matched by its digits ----------
CREATE OR REPLACE FUNCTION customer_login(
  p_phone text,
  p_password text
)
RETURNS customers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  matched customers;
  normalized text;
BEGIN
  normalized := normalize_tz_phone(p_phone);

  -- An exact match first, so a number that is stored the way it was typed
  -- keeps signing in exactly as before.
  SELECT * INTO matched FROM customers
   WHERE phone = p_phone
   LIMIT 1;

  IF matched.id IS NULL AND length(normalized) >= 9 THEN
    SELECT * INTO matched FROM customers
     WHERE normalize_tz_phone(phone) = normalized
     ORDER BY (password_hash IS NOT NULL) DESC, created_at
     LIMIT 1;
  END IF;

  IF matched.id IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF matched.status = 'pending' THEN
    RAISE EXCEPTION 'pending_approval';
  END IF;

  IF matched.status = 'rejected' THEN
    RAISE EXCEPTION 'rejected';
  END IF;

  IF matched.password_hash IS NOT NULL THEN
    IF p_password IS NULL
       OR length(p_password) = 0
       OR matched.password_hash <> crypt(p_password, matched.password_hash) THEN
      RAISE EXCEPTION 'wrong_password';
    END IF;
  END IF;

  matched.password_hash := NULL;
  RETURN matched;
END;
$$;

GRANT EXECUTE ON FUNCTION customer_login(text, text) TO anon;
GRANT EXECUTE ON FUNCTION customer_login(text, text) TO authenticated;
