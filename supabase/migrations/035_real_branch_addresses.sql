-- 035 — the real branches, with their real addresses.
--
-- Migration 029 seeded one branch, 'Arusha', with the comment "the business is
-- in Arusha today; Iringa and the rest get added from Settings -> Branches".
-- Antony gave the actual list on 4 September 2026:
--
--   Dar es Salaam   main office  Majumba Sita, opposite Majumba Sita BRT station
--                   garage       Tabata Dampo
--   Iringa          branch office  Mlandege near TAG Church, Sokoni Street
--   Mafinga         branch         Kinyanambo C, Mizani Street
--
-- Arusha is LEFT ALONE. It is kept as a branch at Antony's instruction, and
-- more to the point `profiles.branch_id` and `mechanics.branch_id` point at it;
-- removing the row would silently clear the branch of everyone assigned there
-- (the foreign keys are ON DELETE SET NULL, so it would not even error).
--
-- Dar es Salaam is ONE branch carrying both of its addresses. Staff are
-- assigned to a city, not to a building, and splitting the office from the yard
-- would mean every Dar receptionist and mechanic had to be reassigned to the
-- right half of the same city.
--
-- Re-running this re-asserts the addresses: if someone has since edited one of
-- these three in Settings -> Branches, applying this again puts it back. That
-- is deliberate for a seed of facts the owner supplied, but it does mean this
-- file is the place to change them, not the UI.

INSERT INTO branches (name, location) VALUES
  ('Dar es Salaam', 'Majumba Sita, opp. Majumba Sita BRT Station · Garage: Tabata Dampo'),
  ('Iringa',        'Mlandege near TAG Church, Sokoni Street'),
  ('Mafinga',       'Kinyanambo C, Mizani Street')
ON CONFLICT (name) DO UPDATE
  SET location = EXCLUDED.location
  WHERE branches.location IS DISTINCT FROM EXCLUDED.location;

-- Arusha's row said 'Arusha, Tanzania', which repeats the branch name and tells
-- nobody where to go. Only touched if it still holds that placeholder.
UPDATE branches
   SET location = NULL
 WHERE name = 'Arusha'
   AND location = 'Arusha, Tanzania';
