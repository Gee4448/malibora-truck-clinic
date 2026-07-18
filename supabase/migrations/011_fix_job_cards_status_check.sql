-- =============================================
-- FIX: client "Ripoti Tatizo" (Report a Problem) submissions fail with
--   new row for relation "job_cards" violates check constraint
--   "job_cards_status_check"
--
-- Cause: inspection_workflow.sql re-created job_cards_status_check but
-- left 'customer_request' out of the allowed list. The client form
-- (src/pages/client/ClientNewRequest.jsx) inserts job cards with
-- status = 'customer_request' — and the anon RLS insert policy from
-- migration 002 only allows that status — so every client problem
-- report is rejected by the constraint.
--
-- Fix: re-create the constraint with the full status list, i.e. the
-- migration 002 list plus 'pre_job_card' from inspection_workflow.sql.
--
-- Apply this in the Supabase dashboard → SQL Editor → Run.
-- =============================================

ALTER TABLE job_cards DROP CONSTRAINT IF EXISTS job_cards_status_check;
ALTER TABLE job_cards ADD CONSTRAINT job_cards_status_check
  CHECK (status IN (
    'customer_request',
    'pre_job_card',
    'pending_approval',
    'open',
    'in_progress',
    'waiting_parts',
    'completed',
    'cancelled'
  ));
