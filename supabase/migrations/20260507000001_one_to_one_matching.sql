-- Enforce strict 1-to-1 matching at the database level.

-- is_available flag on mentor_profiles — false once matched, true when freed
ALTER TABLE mentor_profiles ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true;

-- Unique partial indexes prevent double-assignment at the DB level
-- even if two concurrent edge function calls race
CREATE UNIQUE INDEX IF NOT EXISTS idx_mentor_one_active_assignment
  ON mentor_assignments (mentor_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_one_active_assignment
  ON mentor_assignments (student_id)
  WHERE status = 'active';

-- Trigger: keep is_available in sync with assignment status automatically
CREATE OR REPLACE FUNCTION sync_mentor_availability()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'active') THEN
    UPDATE mentor_profiles SET is_available = false WHERE id = NEW.mentor_id;

  ELSIF (TG_OP = 'UPDATE') THEN
    IF OLD.status = 'active' AND NEW.status != 'active' THEN
      UPDATE mentor_profiles SET is_available = true WHERE id = NEW.mentor_id;
    END IF;

  ELSIF (TG_OP = 'DELETE' AND OLD.status = 'active') THEN
    UPDATE mentor_profiles SET is_available = true WHERE id = OLD.mentor_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER sync_mentor_availability_trigger
  AFTER INSERT OR UPDATE OR DELETE ON mentor_assignments
  FOR EACH ROW EXECUTE FUNCTION sync_mentor_availability();
