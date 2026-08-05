-- =============================================
-- 033: Staff messaging and task assignment
--
-- Client request 5 Aug 2026 (follow-up): "add the feature where the staff
-- within the same company can chat — the boss can send a task to the
-- receptionist or other staff — so communication is easy and smooth."
--
-- Scope, as agreed: office staff only. Everyone here has a real Supabase Auth
-- account, so a message can be attributed to a person and kept private between
-- the two of them. Mechanics are PIN-only with no account; they reach the
-- office through the fault reports in migration 032 instead.
--
-- Two separate things on purpose. A task is not a message: an instruction
-- typed into a conversation gets buried and nobody can tell whether it was
-- done. Tasks carry a state.
--
-- Apply in the Supabase dashboard -> SQL Editor -> Run.
-- =============================================

-- ---------- 1. Messages ----------
-- recipient_id NULL means the whole team — one shared channel, so the boss can
-- say something once instead of six times.
CREATE TABLE IF NOT EXISTS staff_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  body         text NOT NULL,
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_messages_pair
  ON staff_messages(sender_id, recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_messages_inbox
  ON staff_messages(recipient_id, read_at) WHERE recipient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_staff_messages_team
  ON staff_messages(created_at DESC) WHERE recipient_id IS NULL;

ALTER TABLE staff_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON staff_messages FROM anon;

-- You see the team channel, and the direct messages you are part of. Nobody
-- can read a conversation between two other people — not even an owner. This
-- is deliberate: a private message that the boss can read is not a private
-- message, and staff would work around it.
DROP POLICY IF EXISTS "Read own conversations" ON staff_messages;
CREATE POLICY "Read own conversations" ON staff_messages
  FOR SELECT TO authenticated
  USING (
    recipient_id IS NULL
    OR sender_id = auth.uid()
    OR recipient_id = auth.uid()
  );

-- You may only send as yourself.
DROP POLICY IF EXISTS "Send as self" ON staff_messages;
CREATE POLICY "Send as self" ON staff_messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

-- Marking as read is the only update, and only the recipient may do it.
DROP POLICY IF EXISTS "Recipient marks read" ON staff_messages;
CREATE POLICY "Recipient marks read" ON staff_messages
  FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- You can take back something you sent.
DROP POLICY IF EXISTS "Delete own message" ON staff_messages;
CREATE POLICY "Delete own message" ON staff_messages
  FOR DELETE TO authenticated
  USING (sender_id = auth.uid());

-- ---------- 2. Tasks ----------
CREATE TABLE IF NOT EXISTS staff_tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  details      text,
  assigned_to  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  job_card_id  uuid REFERENCES job_cards(id) ON DELETE SET NULL,
  due_date     date,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_tasks_assignee ON staff_tasks(assigned_to, status, due_date);
CREATE INDEX IF NOT EXISTS idx_staff_tasks_open     ON staff_tasks(status) WHERE status = 'open';

ALTER TABLE staff_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON staff_tasks FROM anon;

-- Tasks are work, not private correspondence — everyone signed in can see the
-- board, so the shop can tell what is outstanding and who has it.
DROP POLICY IF EXISTS "Staff read tasks" ON staff_tasks;
CREATE POLICY "Staff read tasks" ON staff_tasks
  FOR SELECT TO authenticated USING (true);

-- Anyone may hand out a task, but only in their own name.
DROP POLICY IF EXISTS "Assign as self" ON staff_tasks;
CREATE POLICY "Assign as self" ON staff_tasks
  FOR INSERT TO authenticated
  WITH CHECK (assigned_by = auth.uid());

-- The person doing it can tick it off; the person who set it can edit or
-- cancel it. Nobody else can quietly close someone else's work.
DROP POLICY IF EXISTS "Owner or assignee updates task" ON staff_tasks;
CREATE POLICY "Owner or assignee updates task" ON staff_tasks
  FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid() OR assigned_by = auth.uid())
  WITH CHECK (assigned_to = auth.uid() OR assigned_by = auth.uid());

DROP POLICY IF EXISTS "Assigner deletes task" ON staff_tasks;
CREATE POLICY "Assigner deletes task" ON staff_tasks
  FOR DELETE TO authenticated
  USING (assigned_by = auth.uid());

-- ---------- 3. Who you can talk to ----------
-- profiles is readable by any signed-in user already, but the directory needs
-- to exclude deactivated people and is nicer with the branch name attached.
CREATE OR REPLACE FUNCTION staff_directory()
RETURNS TABLE(
  id          uuid,
  full_name   text,
  role        text,
  branch_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.role, b.name
  FROM profiles p
  LEFT JOIN branches b ON b.id = p.branch_id
  WHERE COALESCE(p.is_active, true)
  ORDER BY p.full_name;
END;
$$;

REVOKE EXECUTE ON FUNCTION staff_directory() FROM anon, public;
GRANT EXECUTE ON FUNCTION staff_directory() TO authenticated;

-- ---------- 4. Live delivery ----------
-- Without this a new message only appears on the next page load.
ALTER PUBLICATION supabase_realtime ADD TABLE staff_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE staff_tasks;
