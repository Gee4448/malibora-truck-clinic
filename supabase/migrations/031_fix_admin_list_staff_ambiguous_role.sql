-- =============================================
-- 031: FIX — Settings shows: column reference "role" is ambiguous (42702)
--
-- Cause: admin_list_staff() is declared RETURNS TABLE(..., role text, ...).
-- Every column in that list is an OUT parameter, so inside the function body
-- the bare name `role` means both the OUT parameter and profiles.role, and
-- Postgres refuses to guess. The permission check
--
--   SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND role IN (...)
--
-- qualified `profiles.id` but left `role` bare, so the very first statement in
-- the function threw and the staff panel could never load.
--
-- Fix: qualify it. Nothing else about the function changes — the OUT parameter
-- names are part of the JSON the frontend reads (s.role, s.full_name, ...), so
-- they must keep exactly these names.
--
-- Apply in the Supabase dashboard -> SQL Editor -> Run.
-- =============================================

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
    SELECT 1 FROM profiles
     WHERE profiles.id = auth.uid()
       AND profiles.role IN ('owner', 'manager')
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

-- ---------- Verify ----------
-- Run as yourself in the SQL Editor; should list every staff member:
--   SELECT * FROM admin_list_staff();
