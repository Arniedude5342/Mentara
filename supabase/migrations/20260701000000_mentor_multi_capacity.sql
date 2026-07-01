-- ─────────────────────────────────────────────────────────────
-- Multi-student capacity: let a mentor take up to their max_students.
--
-- Before this migration two artifacts from the old strict 1-to-1 system
-- silently capped every mentor at a single student:
--   1. idx_mentor_one_active_assignment (UNIQUE on mentor_id WHERE active)
--      → the DB rejected a mentor's 2nd active assignment outright.
--   2. sync_mentor_availability() set is_available=false on the FIRST
--      active assignment, so a mentor who chose 2 or 3 students still
--      dropped out of the matching pool after one.
--
-- This migration replaces both with capacity-aware logic driven by
-- mentor_profiles.max_students (default 1 when unset).
-- ─────────────────────────────────────────────────────────────

-- 1. Remove the hard 1-student cap on the MENTOR side.
--    The STUDENT side (idx_student_one_active_assignment) stays: a student
--    still has exactly one mentor.
DROP INDEX IF EXISTS idx_mentor_one_active_assignment;

-- 2. Capacity-aware availability. Recomputes is_available after every change
--    to a mentor's assignments: available while active_count < max_students.
CREATE OR REPLACE FUNCTION sync_mentor_availability()
RETURNS TRIGGER AS $$
DECLARE
  m_id UUID;
  cap INTEGER;
  active_count INTEGER;
BEGIN
  m_id := COALESCE(NEW.mentor_id, OLD.mentor_id);

  SELECT COALESCE(max_students, 1) INTO cap
  FROM mentor_profiles
  WHERE id = m_id;

  SELECT count(*) INTO active_count
  FROM mentor_assignments
  WHERE mentor_id = m_id AND status = 'active';

  UPDATE mentor_profiles
  SET is_available = (active_count < COALESCE(cap, 1))
  WHERE id = m_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- (trigger sync_mentor_availability_trigger already exists on mentor_assignments)

-- 3. Race-safe capacity guard. Blocks an INSERT that would push a mentor past
--    their max_students, even if two matching calls run concurrently. The
--    advisory lock serialises inserts per-mentor so the count is authoritative.
CREATE OR REPLACE FUNCTION enforce_mentor_capacity()
RETURNS TRIGGER AS $$
DECLARE
  cap INTEGER;
  active_count INTEGER;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.mentor_id::text));

  SELECT COALESCE(max_students, 1) INTO cap
  FROM mentor_profiles
  WHERE id = NEW.mentor_id;

  SELECT count(*) INTO active_count
  FROM mentor_assignments
  WHERE mentor_id = NEW.mentor_id AND status = 'active';

  IF active_count >= COALESCE(cap, 1) THEN
    RAISE EXCEPTION 'Mentor % is at capacity (% of % active students)',
      NEW.mentor_id, active_count, COALESCE(cap, 1)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS enforce_mentor_capacity_trigger ON mentor_assignments;
CREATE TRIGGER enforce_mentor_capacity_trigger
  BEFORE INSERT ON mentor_assignments
  FOR EACH ROW EXECUTE FUNCTION enforce_mentor_capacity();

-- 4. Re-sync is_available for every existing mentor to reflect current load
--    under the new capacity rules (mentors previously frozen at 1 student who
--    chose 2-3 become available again).
UPDATE mentor_profiles mp
SET is_available = (
  (SELECT count(*) FROM mentor_assignments ma
    WHERE ma.mentor_id = mp.id AND ma.status = 'active')
  < COALESCE(mp.max_students, 1)
);
