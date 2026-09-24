-- =============================================================================
-- HWDT Phase 2 — Migration 007: Shift Assignments & Workflow
-- Table: shift.shift_assignments
-- Status:
--   PROPOSED (پیشنهاد شده)
--   PENDING_CONFIRMATION (در انتظار تایید پرسنل)
--   CONFIRMED (تایید و قطعی شده)
--   REJECTED (رد شده)
--   CANCELLED (لغو شده)
-- Includes triggers to keep assigned_staff_count in sync on shift_instances.
-- =============================================================================

CREATE TABLE IF NOT EXISTS shift.shift_assignments (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id             UUID NOT NULL REFERENCES shift.shift_instances (id) ON DELETE CASCADE,
    employee_id          UUID NOT NULL REFERENCES workforce.employees (id) ON DELETE RESTRICT,
    assigned_by          UUID REFERENCES iam.users (id) ON DELETE SET NULL,
    status               VARCHAR(30) NOT NULL DEFAULT 'CONFIRMED'
                         CHECK (status IN ('PROPOSED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'REJECTED', 'CANCELLED')),
    notes                TEXT,
    rejection_reason     TEXT,
    confirmed_at         TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_shift_employee UNIQUE (shift_id, employee_id)
);

CREATE INDEX IF NOT EXISTS ix_assignments_shift ON shift.shift_assignments (shift_id);
CREATE INDEX IF NOT EXISTS ix_assignments_employee ON shift.shift_assignments (employee_id);
CREATE INDEX IF NOT EXISTS ix_assignments_status ON shift.shift_assignments (status);

DROP TRIGGER IF EXISTS trg_shift_assignments_touch ON shift.shift_assignments;
CREATE TRIGGER trg_shift_assignments_touch BEFORE UPDATE ON shift.shift_assignments
    FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- Trigger function to update assigned_staff_count on shift.shift_instances
CREATE OR REPLACE FUNCTION shift.sync_assigned_staff_count() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    target_shift_id UUID;
BEGIN
    target_shift_id := COALESCE(NEW.shift_id, OLD.shift_id);
    UPDATE shift.shift_instances
       SET assigned_staff_count = (
           SELECT count(*)::int
             FROM shift.shift_assignments
            WHERE shift_id = target_shift_id
              AND status IN ('PROPOSED', 'PENDING_CONFIRMATION', 'CONFIRMED')
       )
     WHERE id = target_shift_id;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_assigned_staff_count ON shift.shift_assignments;
CREATE TRIGGER trg_sync_assigned_staff_count
    AFTER INSERT OR UPDATE OR DELETE ON shift.shift_assignments
    FOR EACH ROW EXECUTE FUNCTION shift.sync_assigned_staff_count();
