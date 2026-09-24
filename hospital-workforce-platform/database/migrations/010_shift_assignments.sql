-- Phase 2 canonical migration 010: workforce assignments.
-- 007 owns the physical table for compatibility with the first Phase 2 build.
CREATE SCHEMA IF NOT EXISTS shift;
ALTER TABLE IF EXISTS shift.shift_assignments
  ADD COLUMN IF NOT EXISTS assignment_status VARCHAR(30);
UPDATE shift.shift_assignments SET assignment_status = status
 WHERE assignment_status IS NULL;
ALTER TABLE IF EXISTS shift.shift_assignments
  ALTER COLUMN assignment_status SET DEFAULT 'PROPOSED';
CREATE INDEX IF NOT EXISTS ix_assignments_employee_status
  ON shift.shift_assignments (employee_id, status);
COMMENT ON TABLE shift.shift_assignments IS 'Audited workforce-to-shift assignments used by the deterministic rules engine and Phase 3 matcher.';
