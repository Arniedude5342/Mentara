-- ============================================================
-- Mentara Migration: Bug-fix batch (Bug Fixer Agent)
-- 2026-06-02
-- ============================================================

-- ─── 1. Remove overly-broad mentor_assignments INSERT policy ─────────────────
-- The previous "Participants can insert assignments" policy only checked that
-- the inserter was either the student_id or mentor_id of the row. That let any
-- authenticated student fabricate an assignment with any mentor (and vice
-- versa), completely bypassing the AI matching logic. Assignments are now
-- created exclusively by the `auto-assign-mentor` Edge Function via the
-- service-role key (which bypasses RLS), so no client-side INSERT policy is
-- required.
DROP POLICY IF EXISTS "Participants can insert assignments" ON mentor_assignments;
