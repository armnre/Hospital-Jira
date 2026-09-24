-- =============================================================================
-- HWDT-9 / HWDT-11 / HWDT-12  Migration 003 — Employee Digital Profile core
--   workforce.departments, workforce.employees, workforce.skills, workforce.employee_skills
-- =============================================================================

-- ---------------------------------------------------------------- departments (HWDT-11)
CREATE TABLE IF NOT EXISTS workforce.departments (
    id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name         VARCHAR(100) NOT NULL,
    description  TEXT         NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_departments_name ON workforce.departments (lower(name));

-- ---------------------------------------------------------------- employees (HWDT-9)
CREATE TABLE IF NOT EXISTS workforce.employees (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_number    VARCHAR(20)  NOT NULL CHECK (employee_number ~ '^EMP-[0-9]{4,10}$'),
    first_name         VARCHAR(100) NOT NULL,
    last_name          VARCHAR(100) NOT NULL,
    national_id        VARCHAR(30)  NOT NULL,
    email              VARCHAR(255) NOT NULL,
    phone              VARCHAR(30)  NOT NULL DEFAULT '',
    department_id      INTEGER      NOT NULL REFERENCES workforce.departments (id) ON DELETE RESTRICT,
    job_title          VARCHAR(120) NOT NULL,
    employment_type    VARCHAR(20)  NOT NULL
                       CHECK (employment_type IN ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'LOCUM', 'INTERN')),
    employee_category  VARCHAR(20)  NOT NULL
                       CHECK (employee_category IN ('CLINICAL', 'NON_CLINICAL')),
    status             VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE'
                       CHECK (status IN ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED')),
    hire_date          DATE,
    deleted_at         TIMESTAMPTZ,                     -- soft delete (regulatory retention)
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);
-- Uniqueness only among non-deleted employees
CREATE UNIQUE INDEX IF NOT EXISTS ux_employees_number   ON workforce.employees (employee_number) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_employees_email    ON workforce.employees (lower(email))   WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_employees_national ON workforce.employees (national_id)    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_employees_department ON workforce.employees (department_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_employees_category   ON workforce.employees (employee_category) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_employees_name       ON workforce.employees (lower(last_name), lower(first_name));

DROP TRIGGER IF EXISTS trg_employees_touch ON workforce.employees;
CREATE TRIGGER trg_employees_touch BEFORE UPDATE ON workforce.employees
    FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- Link IAM users to employee records (EMPLOYEE self-service)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_employee') THEN
        ALTER TABLE iam.users
            ADD CONSTRAINT fk_users_employee FOREIGN KEY (employee_id)
            REFERENCES workforce.employees (id) ON DELETE SET NULL;
    END IF;
END $$;

-- ---------------------------------------------------------------- skills (HWDT-12)
CREATE TABLE IF NOT EXISTS workforce.skills (
    id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    category    VARCHAR(60)  NOT NULL,        -- e.g. Life Support, Critical Care, Administrative
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_skills_name ON workforce.skills (lower(name));

CREATE TABLE IF NOT EXISTS workforce.employee_skills (
    employee_id       UUID         NOT NULL REFERENCES workforce.employees (id) ON DELETE CASCADE,
    skill_id          INTEGER      NOT NULL REFERENCES workforce.skills (id)    ON DELETE CASCADE,
    level             VARCHAR(20)  NOT NULL
                      CHECK (level IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT')),
    years_experience  NUMERIC(4,1) NOT NULL DEFAULT 0 CHECK (years_experience >= 0 AND years_experience <= 60),
    PRIMARY KEY (employee_id, skill_id)
);
CREATE INDEX IF NOT EXISTS ix_employee_skills_skill ON workforce.employee_skills (skill_id);
