-- =============================================
-- 039: Actually delete a staff member
--
-- Client report 23 Sep 2026: "when I remove staff and try to open them again it
-- says the staff is already registered — when I delete staff their information
-- must be deleted too."
--
-- Cause: the staff screen only had Deactivate. That flips profiles.is_active
-- but leaves the login in auth.users, so the username stays taken forever and
-- sign-up answers "User already registered".
--
-- admin_delete_staff() removes the login itself. Deleting the auth.users row
-- cascades to profiles (001), and from there to the person's own chat messages
-- and tasks (033). Business records they touched — job cards, invoices,
-- inspections, approvals — are NOT deleted: those belong to the garage and the
-- customer. Their "created by / assigned to / approved by" link is cleared
-- instead, which is what lets the delete go through.
--
-- The FK columns are found from the catalog rather than listed by hand, so a
-- table added later (or one created straight in the dashboard) cannot make the
-- delete fail with a foreign-key error.
--
-- Rules match admin_upsert_staff_profile (029): owner/manager only, only an
-- owner may delete an owner, and nobody may delete themselves.
--
-- Apply in the Supabase dashboard -> SQL Editor -> Run.
-- =============================================

CREATE OR REPLACE FUNCTION admin_delete_staff(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_caller_role text;
  v_target_role text;
  fk            record;
  v_blocked     boolean;
BEGIN
  SELECT profiles.role INTO v_caller_role FROM profiles WHERE profiles.id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'missing_user';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_edit_self';
  END IF;

  SELECT profiles.role INTO v_target_role FROM profiles WHERE profiles.id = p_user_id;
  IF v_target_role = 'owner' AND v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'owner_only';
  END IF;

  -- Unhook every single-column foreign key outside the auth schema that points
  -- at this person and would otherwise block the delete ('a' = NO ACTION,
  -- 'r' = RESTRICT). CASCADE / SET NULL keys are left for Postgres to handle.
  FOR fk IN
    SELECT c.conrelid::regclass AS tbl, a.attname AS col, a.attnotnull AS is_required
    FROM pg_constraint c
    JOIN pg_class t     ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.confrelid IN ('public.profiles'::regclass, 'auth.users'::regclass)
      AND n.nspname <> 'auth'
      AND NOT (c.conrelid = 'public.profiles'::regclass AND a.attname = 'id')
      AND array_length(c.conkey, 1) = 1
      AND c.confdeltype IN ('a', 'r')
  LOOP
    -- A required link can't be cleared, and deleting a business record to make
    -- room is not ours to decide. Refuse — but only if this person actually
    -- has such a record, or one required column would block every delete.
    IF fk.is_required THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE %I = $1)', fk.tbl, fk.col)
        INTO v_blocked USING p_user_id;
      IF v_blocked THEN
        RAISE EXCEPTION 'staff_has_records: %.%', fk.tbl, fk.col;
      END IF;
    ELSE
      EXECUTE format('UPDATE %s SET %I = NULL WHERE %I = $1', fk.tbl, fk.col, fk.col) USING p_user_id;
    END IF;
  END LOOP;

  -- A profile without a login (shouldn't exist, but be thorough).
  DELETE FROM profiles WHERE id = p_user_id;
  -- The login itself. Frees the username for reuse.
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_delete_staff(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION admin_delete_staff(uuid) TO authenticated;
