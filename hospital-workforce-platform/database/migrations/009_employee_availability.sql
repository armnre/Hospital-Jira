-- Phase 2 canonical migration 009: employee availability.
-- 008 created the original table for existing installations; this migration is
-- deliberately idempotent so upgrades and fresh deployments converge.
CREATE SCHEMA IF NOT EXISTS shift;
ALTER TABLE IF EXISTS shift.employee_availability
  ADD COLUMN IF NOT EXISTS availability_status VARCHAR(30);
UPDATE shift.employee_availability
   SET availability_status = CASE WHEN available THEN 'AVAILABLE' ELSE reason END
 WHERE availability_status IS NULL;
ALTER TABLE IF EXISTS shift.employee_availability
  ALTER COLUMN availability_status SET DEFAULT 'AVAILABLE';
CREATE INDEX IF NOT EXISTS ix_availability_status_date
  ON shift.employee_availability (availability_status, date);
COMMENT ON TABLE shift.employee_availability IS 'Employee availability and leave calendar; dates are Gregorian with Jalali display value.';

-- Canonical role/status vocabulary added without rewriting migration 006.
DO $$ BEGIN
  ALTER TABLE iam.users DROP CONSTRAINT IF EXISTS users_role_check;
  ALTER TABLE iam.users ADD CONSTRAINT users_role_check CHECK (role IN (
    'ADMIN','HR_MANAGER','COMPLIANCE_OFFICER','EMPLOYEE','HOSPITAL_ADMIN',
    'NURSING_MANAGER','SHIFT_SUPERVISOR','DEPARTMENT_HEAD','DEPARTMENT_MANAGER'));
EXCEPTION WHEN undefined_table THEN NULL; END $$;

ALTER TABLE IF EXISTS workforce.departments
  ADD COLUMN IF NOT EXISTS type VARCHAR(60) NOT NULL DEFAULT 'GENERAL';
ALTER TABLE IF EXISTS shift.shift_instances DROP CONSTRAINT IF EXISTS shift_shift_instances_status_check;
ALTER TABLE IF EXISTS shift.shift_instances DROP CONSTRAINT IF EXISTS shift_instances_status_check;
ALTER TABLE IF EXISTS shift.shift_instances ADD CONSTRAINT shift_instances_status_check
  CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','ACTIVE','RUNNING','COMPLETED','CANCELLED'));
ALTER TABLE IF EXISTS shift.employee_availability DROP CONSTRAINT IF EXISTS employee_availability_reason_check;
ALTER TABLE IF EXISTS shift.employee_availability ADD CONSTRAINT employee_availability_reason_check
  CHECK (reason IN ('AVAILABLE','UNAVAILABLE','VACATION','SICK_LEAVE','MEDICAL_LEAVE','TRAINING'));
