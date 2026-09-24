-- =============================================================================
-- HWDT-9  Migration 002 — IAM users (JWT authentication, role-based access)
-- Roles prepared for Phase 1: ADMIN, HR_MANAGER, COMPLIANCE_OFFICER, EMPLOYEE
-- Passwords are stored as scrypt hashes (never plaintext).
-- =============================================================================
CREATE TABLE IF NOT EXISTS iam.users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email          VARCHAR(255) NOT NULL,
    password_hash  TEXT         NOT NULL,
    full_name      VARCHAR(200) NOT NULL,
    role           VARCHAR(30)  NOT NULL
                   CHECK (role IN ('ADMIN', 'HR_MANAGER', 'COMPLIANCE_OFFICER', 'EMPLOYEE')),
    employee_id    UUID,                          -- FK added in 003 (EMPLOYEE self-service)
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    last_login_at  TIMESTAMPTZ,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email ON iam.users (lower(email));

DROP TRIGGER IF EXISTS trg_users_touch ON iam.users;
CREATE TRIGGER trg_users_touch BEFORE UPDATE ON iam.users
    FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();
