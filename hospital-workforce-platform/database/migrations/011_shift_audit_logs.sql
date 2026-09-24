-- Phase 2 canonical migration 011: append-only shift audit log.
CREATE SCHEMA IF NOT EXISTS shift;
CREATE TABLE IF NOT EXISTS shift.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES iam.users(id) ON DELETE SET NULL,
  action VARCHAR(60) NOT NULL CHECK (action IN (
    'SHIFT_CREATED','SHIFT_UPDATED','SHIFT_APPROVED','SHIFT_CANCELLED',
    'EMPLOYEE_ASSIGNED','EMPLOYEE_REMOVED','AVAILABILITY_SET'
  )),
  entity_type VARCHAR(60) NOT NULL,
  entity_id VARCHAR(80) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS ix_shift_audit_entity ON shift.audit_logs(entity_type, entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ix_shift_audit_user ON shift.audit_logs(user_id, occurred_at DESC);
COMMENT ON TABLE shift.audit_logs IS 'Append-only audit events for workforce scheduling actions.';
