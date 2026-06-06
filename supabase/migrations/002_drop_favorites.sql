-- Migration: remove student-picks-mentor feature
-- Mentors are now assigned exclusively by AI. Students can no longer
-- browse or favourite mentors directly, so the favorites table is obsolete.

DROP TABLE IF EXISTS favorites CASCADE;
-- CASCADE drops the dependent RLS policies and the idx_favorites_student_id index automatically.
