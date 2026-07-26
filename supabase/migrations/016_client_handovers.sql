-- =============================================
-- FEATURE (client req 2026-07-26 #4): let customers read their handover in the
-- portal. Staff already create handover_cards (src/pages/Handover.jsx); this just
-- opens read access to the client portal (anon role).
--
-- Source: Antony WhatsApp voice note 2026-07-26 (1:22:22) + video 2 ("Create
-- Handover"). Full spec: _client-notes/REQUIREMENTS-2026-07-26.md item #4.
--
-- handover_cards has RLS enabled (migration 001) with only `authenticated`
-- policies, so the anon portal can't see handovers at all. Add an anon SELECT
-- policy mirroring the job_cards pattern (migration 002). handover_cards holds no
-- cost/profit columns — only work summaries, warranty and next-service info — so
-- it is safe for the customer to read. Reads/writes of money stay staff-only.
--
-- Apply in Supabase dashboard -> SQL Editor -> Run.
-- =============================================

DROP POLICY IF EXISTS "Anon can view handovers" ON handover_cards;
CREATE POLICY "Anon can view handovers" ON handover_cards
  FOR SELECT TO anon USING (true);
