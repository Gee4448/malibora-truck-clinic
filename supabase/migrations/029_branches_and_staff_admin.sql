-- =============================================
-- 029: Branches, and letting the owner open staff accounts himself
--
-- Client request 5 Aug 2026 (voice note 12.42.04):
--   * "give my admin account the power to register secretaries, managers or
--      mechanics myself — open their account, their username and password —
--      so we finish the thing right there", plus new roles;
--   * "add branch too, so you know which branch. Iringa branch, wherever —
--      we'll have branches. It's better to know where a person works from."
--
-- What this migration adds:
--   1. branches            — the garage's locations.
--   2. profiles.branch_id  — which branch a staff member works from.
--   3. mechanics.branch_id — same, for the PIN-portal mechanics.
--   4. A wider role list on profiles (secretary, storekeeper, accountant,
--      mechanic ... alongside the original four).
--   5. admin_upsert_staff_profile() — an owner/manager names a NEW auth user
--      and gives them a role + branch. The auth user itself is created from
--      the browser with the ordinary sign-up API (see
--      src/lib/staffAccounts.js); this function is what turns that bare
--      account into a staff member.
--   6. admin_list_staff()  — the roster, including each person's login email,
--      which is otherwise unreadable in auth.users.
--
-- >>> BEFORE THIS FEATURE WORKS: in the Supabase dashboard go to
-- >>> Authentication -> Providers -> Email and turn "Confirm email" OFF.
-- >>> Staff created with a username (not a real mailbox) can never click a
-- >>> confirmation link, so with it ON they would never be able to log in.
--
-- Apply in the Supabase dashboard -> SQL Editor -> Run.
-- =============================================

-- ---------- 1. Branches ----------
CREATE TABLE IF NOT EXISTS branches (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  location   text,
  phone      text,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

-- Everyone signed in needs to read them (they fill the branch pickers);
-- only owner/manager may change the list.
DROP POLICY IF EXISTS "Staff read branches" ON branches;
CREATE POLICY "Staff read branches" ON branches
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Managers write branches" ON branches;
CREATE POLICY "Managers write branches" ON branches
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'manager')));

-- The mechanic portal runs unauthenticated (PIN only, migration 008), and the
-- job list shows the branch name, so anon needs read access to the name only.
GRANT SELECT (id, name, active) ON branches TO anon;
DROP POLICY IF EXISTS "Portal reads branch names" ON branches;
CREATE POLICY "Portal reads branch names" ON branches
  FOR SELECT TO anon USING (active);

-- ---------- 2. Who works where ----------
ALTER TABLE profiles  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE mechanics ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_branch  ON profiles(branch_id);
CREATE INDEX IF NOT EXISTS idx_mechanics_branch ON mechanics(branch_id);

-- ---------- 3. The wider role list ----------
-- 'technician' is kept only because migration 001 allowed it and rows may
-- already carry it. New hires should be given 'mechanic'.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'owner',
    'manager',
    'supervisor',
    'accountant',
    'secretary',
    'receptionist',
    'storekeeper',
    'mechanic',
    'technician'
  ));

-- ---------- 4. Name a new staff account (owner/manager) ----------
-- p_user_id is the id returned by the browser's sign-up call. Everything else
-- is what the admin typed into the form.
--
-- Rules:
--   * caller must be owner or manager;
--   * only an owner may grant or modify the 'owner' role — a manager must not
--     be able to promote themselves or anyone else past their own level;
--   * nobody may change their own role here (that is what the access code in
--     migration 018 is for), so the last owner cannot demote themselves by
--     accident and lock the business out of Reports.
CREATE OR REPLACE FUNCTION admin_upsert_staff_profile(
  p_user_id   uuid,
  p_full_name text,
  p_phone     text,
  p_role      text,
  p_branch_id uuid,
  p_is_active boolean DEFAULT true
)
RETURNS profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_role text;
  v_target_role text;
  result        profiles;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'missing_user';
  END IF;

  IF p_full_name IS NULL OR length(trim(p_full_name)) = 0 THEN
    RAISE EXCEPTION 'name_required';
  END IF;

  IF p_role NOT IN (
    'owner', 'manager', 'supervisor', 'accountant', 'secretary',
    'receptionist', 'storekeeper', 'mechanic', 'technician'
  ) THEN
    RAISE EXCEPTION 'bad_role';
  END IF;

  SELECT role INTO v_target_role FROM profiles WHERE id = p_user_id;

  -- Only an owner may create an owner, or edit one.
  IF (p_role = 'owner' OR v_target_role = 'owner') AND v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'owner_only';
  END IF;

  -- No self-editing of your own role/status through this tool.
  IF p_user_id = auth.uid() AND (p_role <> v_caller_role OR p_is_active = false) THEN
    RAISE EXCEPTION 'cannot_edit_self';
  END IF;

  INSERT INTO profiles (id, full_name, phone, role, branch_id, is_active)
  VALUES (p_user_id, trim(p_full_name), NULLIF(trim(COALESCE(p_phone, '')), ''),
          p_role, p_branch_id, COALESCE(p_is_active, true))
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone     = EXCLUDED.phone,
    role      = EXCLUDED.role,
    branch_id = EXCLUDED.branch_id,
    is_active = EXCLUDED.is_active,
    updated_at = now()
  RETURNING * INTO result;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_upsert_staff_profile(uuid, text, text, text, uuid, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION admin_upsert_staff_profile(uuid, text, text, text, uuid, boolean) TO authenticated;

-- ---------- 5. The staff roster ----------
-- profiles is readable by any signed-in user, but the login email lives in
-- auth.users, which is not. The admin screen needs it to tell two people with
-- the same name apart, so it is exposed here to owner/manager only.
CREATE OR REPLACE FUNCTION admin_list_staff()
RETURNS TABLE(
  id          uuid,
  full_name   text,
  phone       text,
  role        text,
  branch_id   uuid,
  branch_name text,
  is_active   boolean,
  email       text,
  created_at  timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND role IN ('owner', 'manager')
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.phone, p.role, p.branch_id, b.name,
         COALESCE(p.is_active, true), u.email::text, p.created_at
  FROM profiles p
  LEFT JOIN branches b ON b.id = p.branch_id
  LEFT JOIN auth.users u ON u.id = p.id
  ORDER BY COALESCE(p.is_active, true) DESC, p.full_name;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_list_staff() FROM anon, public;
GRANT EXECUTE ON FUNCTION admin_list_staff() TO authenticated;

-- ---------- 6. Mechanics get a branch too ----------
-- Replaces the 5-argument version from 008/028 with a 6-argument one. The old
-- signature is dropped so PostgREST cannot pick the wrong overload.
-- (search_path keeps the `extensions` fix from migration 028 — without it
-- gen_salt() is unresolvable and saving a mechanic fails silently.)
DROP FUNCTION IF EXISTS admin_save_mechanic(uuid, text, text, text, boolean);

CREATE OR REPLACE FUNCTION admin_save_mechanic(
  p_id uuid,
  p_name text,
  p_phone text,
  p_code text,
  p_active boolean,
  p_branch_id uuid DEFAULT NULL
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

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'name_required';
  END IF;

  IF p_id IS NULL THEN
    IF p_code IS NULL OR length(p_code) < 4 THEN
      RAISE EXCEPTION 'pin_too_short';
    END IF;
    INSERT INTO mechanics (name, phone, pin_hash, active, branch_id)
    VALUES (trim(p_name), NULLIF(p_phone, ''), crypt(p_code, gen_salt('bf')),
            COALESCE(p_active, true), p_branch_id)
    RETURNING * INTO result;
  ELSE
    UPDATE mechanics SET
      name      = trim(p_name),
      phone     = NULLIF(p_phone, ''),
      active    = COALESCE(p_active, active),
      branch_id = p_branch_id,
      pin_hash  = CASE
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

GRANT EXECUTE ON FUNCTION admin_save_mechanic(uuid, text, text, text, boolean, uuid) TO authenticated;

-- ---------- 7. Seed the first branch ----------
-- The business is in Arusha today; Iringa and the rest get added from
-- Settings -> Branches.
INSERT INTO branches (name, location) VALUES ('Arusha', 'Arusha, Tanzania')
ON CONFLICT (name) DO NOTHING;
