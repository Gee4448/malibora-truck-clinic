-- 036 — fold the hand-entered branches into the real ones.
--
-- This one DELETES rows. Read section 1 before running it: the order of the
-- statements is what stops anyone losing their branch.
--
-- After 035 the branch list held five rows for three places:
--
--   Dar es Salaam                  Majumba Sita ... · Garage: Tabata Dampo   (035)
--   Iringa                         Mlandege near TAG Church, Sokoni Street   (035)
--   Mafinga                        Kinyanambo C, Mizani Street               (035)
--   Tabata Dampo                   'Dar es salaam, Tanzania'                 (hand-entered)
--   Kinyanambo C, Mafinga, Iringa  'Iringa Tanzania'                         (hand-entered)
--
-- The last two were added through Settings -> Branches before the addresses
-- were known here, using the street as the branch NAME. They are not extra
-- places: 'Tabata Dampo' is the Dar garage, and 'Kinyanambo C, Mafinga, Iringa'
-- is Mafinga — its location field even says Iringa, which is the next town.
--
-- Leaving them costs more than a tidy list. Every branch picker in the app —
-- adding staff, adding a mechanic — offers all five, so two people working in
-- the same yard can end up filed under different branches, and any report that
-- groups by branch then splits them.
--
-- Staff and mechanics are moved BEFORE the delete. `profiles.branch_id` and
-- `mechanics.branch_id` are ON DELETE SET NULL, so deleting first would clear
-- their branch silently — no error, just people with no branch and no record of
-- which one they had. Those two columns are the only references to this table;
-- everything else (admin_list_staff, the chat roster) only LEFT JOINs it.

BEGIN;

-- 1. Move anyone assigned to a duplicate onto the branch that replaces it.
UPDATE profiles p
   SET branch_id = keep.id
  FROM branches dup
  JOIN branches keep
    ON keep.name = CASE dup.name
         WHEN 'Tabata Dampo'                  THEN 'Dar es Salaam'
         WHEN 'Kinyanambo C, Mafinga, Iringa' THEN 'Mafinga'
       END
 WHERE p.branch_id = dup.id
   AND dup.name IN ('Tabata Dampo', 'Kinyanambo C, Mafinga, Iringa');

UPDATE mechanics m
   SET branch_id = keep.id
  FROM branches dup
  JOIN branches keep
    ON keep.name = CASE dup.name
         WHEN 'Tabata Dampo'                  THEN 'Dar es Salaam'
         WHEN 'Kinyanambo C, Mafinga, Iringa' THEN 'Mafinga'
       END
 WHERE m.branch_id = dup.id
   AND dup.name IN ('Tabata Dampo', 'Kinyanambo C, Mafinga, Iringa');

-- 2. Only now remove them, and only if the branch replacing each one is
--    actually present — so a half-applied 035 cannot strand anybody.
DELETE FROM branches dup
 WHERE dup.name = 'Tabata Dampo'
   AND EXISTS (SELECT 1 FROM branches k WHERE k.name = 'Dar es Salaam');

DELETE FROM branches dup
 WHERE dup.name = 'Kinyanambo C, Mafinga, Iringa'
   AND EXISTS (SELECT 1 FROM branches k WHERE k.name = 'Mafinga');

COMMIT;

-- Check afterwards — three rows, and nobody left without a branch who had one:
--
--   select b.name, b.location,
--          (select count(*) from profiles  p where p.branch_id = b.id) as staff,
--          (select count(*) from mechanics m where m.branch_id = b.id) as mechanics
--   from branches b order by b.name;
--
-- The Dar garage is part of the Dar es Salaam branch, not a branch of its own
-- (Antony, 4 Sep 2026, asked twice and answered the same way both times). Staff
-- are assigned to a city; splitting the office from the yard would mean every
-- Dar receptionist and mechanic had to be filed to the right half of one town,
-- and a report grouped by branch would show the same garage twice.
