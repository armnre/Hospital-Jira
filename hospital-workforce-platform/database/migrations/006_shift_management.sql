-- =============================================================================
-- HWDT Phase 2 — Migration 006: Shift Management & Hospital Departments
-- Enhances workforce.departments with Persian localization (name_fa, code, active)
-- Creates schema `shift` and tables:
--   shift.shift_templates
--   shift.shift_instances
-- Extends IAM user roles to support Iranian hospital workflow roles.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS shift;

-- Jalali Calendar conversion function in SQL (Persian Hospital Standard)
CREATE OR REPLACE FUNCTION shift.gregorian_to_jalali(gdate date) RETURNS varchar AS $$
DECLARE
    gy int; gm int; gd int;
    g_d_m int[] := ARRAY[0,31,59,90,120,151,181,212,243,273,304,334];
    gy2 int;
    days int;
    jy int; jm int; jd int;
BEGIN
    IF gdate IS NULL THEN RETURN NULL; END IF;
    gy := EXTRACT(YEAR FROM gdate)::int;
    gm := EXTRACT(MONTH FROM gdate)::int;
    gd := EXTRACT(DAY FROM gdate)::int;
    IF gm > 2 THEN gy2 := gy; ELSE gy2 := gy - 1; END IF;
    days := 355666 + (365 * gy) + ((gy2 + 3) / 4) - ((gy2 + 99) / 100) + ((gy2 + 399) / 400) + gd + g_d_m[gm];
    jy := -1595 + (33 * (days / 12053));
    days := days % 12053;
    jy := jy + 4 * (days / 1461);
    days := days % 1461;
    IF days > 365 THEN
        jy := jy + ((days - 1) / 365);
        days := (days - 1) % 365;
    END IF;
    IF days < 186 THEN
        jm := 1 + (days / 31);
        jd := 1 + (days % 31);
    ELSE
        jm := 7 + ((days - 186) / 30);
        jd := 1 + ((days - 186) % 30);
    END IF;
    RETURN lpad(jy::text, 4, '0') || '/' || lpad(jm::text, 2, '0') || '/' || lpad(jd::text, 2, '0');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 1. Extend iam.users check constraint to support hospital roles:
--    HOSPITAL_ADMIN (مدیر ارشد بیمارستان)
--    NURSING_MANAGER (مدیر پرستاری / مترون)
--    SHIFT_SUPERVISOR (سوپروایزر شیفت / سرپرستار)
--    DEPARTMENT_HEAD (رئیس / سرپرست بخش)
DO $$
BEGIN
    ALTER TABLE iam.users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE iam.users ADD CONSTRAINT users_role_check
        CHECK (role IN (
            'ADMIN', 'HR_MANAGER', 'COMPLIANCE_OFFICER', 'EMPLOYEE',
            'HOSPITAL_ADMIN', 'NURSING_MANAGER', 'SHIFT_SUPERVISOR', 'DEPARTMENT_HEAD'
        ));
END $$;

-- 2. Enhance workforce.departments with Persian support
ALTER TABLE workforce.departments
    ADD COLUMN IF NOT EXISTS name_fa     VARCHAR(150),
    ADD COLUMN IF NOT EXISTS name_en     VARCHAR(150),
    ADD COLUMN IF NOT EXISTS code        VARCHAR(30),
    ADD COLUMN IF NOT EXISTS active      BOOLEAN NOT NULL DEFAULT TRUE;

-- Update existing departments with Persian hospital names & codes
UPDATE workforce.departments SET name_fa = 'بخش مراقبت‌های ویژه (ICU)', name_en = 'ICU', code = 'ICU-01', active = TRUE WHERE lower(name) = 'icu';
UPDATE workforce.departments SET name_fa = 'بخش اورژانس', name_en = 'Emergency', code = 'EMERG-01', active = TRUE WHERE lower(name) = 'emergency';
UPDATE workforce.departments SET name_fa = 'اتاق عمل و جراحی', name_en = 'Surgery & OR', code = 'SURG-01', active = TRUE WHERE lower(name) = 'surgery';
UPDATE workforce.departments SET name_fa = 'بخش کودکان و اطفال', name_en = 'Pediatrics', code = 'PED-01', active = TRUE WHERE lower(name) = 'pediatrics';
UPDATE workforce.departments SET name_fa = 'بخش مراقبت‌های ویژه نوزادان (NICU)', name_en = 'NICU', code = 'NICU-01', active = TRUE WHERE lower(name) = 'nicu';
UPDATE workforce.departments SET name_fa = 'بخش رادیولوژی و تصویربرداری', name_en = 'Radiology', code = 'RAD-01', active = TRUE WHERE lower(name) = 'radiology';
UPDATE workforce.departments SET name_fa = 'آزمایشگاه تشخیص طبی', name_en = 'Laboratory', code = 'LAB-01', active = TRUE WHERE lower(name) = 'laboratory';
UPDATE workforce.departments SET name_fa = 'داروخانه بیمارستان', name_en = 'Pharmacy', code = 'PHARM-01', active = TRUE WHERE lower(name) = 'pharmacy';
UPDATE workforce.departments SET name_fa = 'بخش همودیالیز و نفرولوژی', name_en = 'Nephrology & Dialysis', code = 'NEPH-01', active = TRUE WHERE lower(name) = 'nephrology';
UPDATE workforce.departments SET name_fa = 'مدیریت و امور اداری بیمارستان', name_en = 'Administration', code = 'ADMIN-01', active = TRUE WHERE lower(name) = 'administration';
UPDATE workforce.departments SET name_fa = 'منابع انسانی و امور کارکنان', name_en = 'Human Resources', code = 'HR-01', active = TRUE WHERE lower(name) = 'human resources';

-- Fallback for any unmapped
UPDATE workforce.departments SET name_fa = name WHERE name_fa IS NULL;
UPDATE workforce.departments SET name_en = name WHERE name_en IS NULL;
UPDATE workforce.departments SET code = upper(substring(name from 1 for 5)) WHERE code IS NULL;

-- Insert additional Iranian hospital departments if not present
INSERT INTO workforce.departments (name, name_fa, name_en, code, description, active)
VALUES
    ('CCU', 'بخش مراقبت‌های ویژه قلب (CCU)', 'CCU (Coronary Care Unit)', 'CCU-01', 'مراقبت ویژه بیماران حاد قلبی', TRUE),
    ('Internal Medicine', 'بخش داخلی', 'Internal Medicine Ward', 'INT-01', 'بخش بستری بیماران عمومی داخلی و عفونی', TRUE),
    ('Obstetrics & Gynecology', 'بخش زنان و زایمان (بلوک زایمان)', 'Obstetrics & Gynecology', 'OBGYN-01', 'بلوک زایمان و مراقبت‌های تخصصی زنان', TRUE)
ON CONFLICT DO NOTHING;

-- 3. Shift Templates (الگوهای شیفت)
-- Shift types: MORNING (صبح), AFTERNOON (عصر), NIGHT (شب), ON_CALL (آنکال), EMERGENCY (اضطراری)
CREATE TABLE IF NOT EXISTS shift.shift_templates (
    id                   SERIAL PRIMARY KEY,
    name_fa              VARCHAR(150) NOT NULL,
    department_id        INTEGER NOT NULL REFERENCES workforce.departments (id) ON DELETE RESTRICT,
    shift_type           VARCHAR(30) NOT NULL
                         CHECK (shift_type IN ('MORNING', 'AFTERNOON', 'NIGHT', 'ON_CALL', 'EMERGENCY')),
    start_time           TIME NOT NULL,
    end_time             TIME NOT NULL,
    required_staff_count INTEGER NOT NULL DEFAULT 1 CHECK (required_staff_count > 0),
    required_role        VARCHAR(120),
    required_skill       VARCHAR(100),
    description          TEXT,
    active               BOOLEAN NOT NULL DEFAULT TRUE,
    created_by           UUID REFERENCES iam.users (id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_shift_templates_dept ON shift.shift_templates (department_id);

DROP TRIGGER IF EXISTS trg_shift_templates_touch ON shift.shift_templates;
CREATE TRIGGER trg_shift_templates_touch BEFORE UPDATE ON shift.shift_templates
    FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- 4. Shift Instances (نمونه‌های اجرایی شیفت در تقویم)
-- Status:
--   DRAFT (پیش‌نویس)
--   PENDING_APPROVAL (در انتظار تایید)
--   APPROVED (تایید شده)
--   RUNNING (در حال اجرا)
--   COMPLETED (تکمیل شده)
--   CANCELLED (لغو شده)
CREATE TABLE IF NOT EXISTS shift.shift_instances (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id          INTEGER REFERENCES shift.shift_templates (id) ON DELETE SET NULL,
    jalali_date          VARCHAR(10) NOT NULL, -- Format: YYYY/MM/DD e.g. 1404/10/20
    gregorian_date       DATE NOT NULL,        -- Format: YYYY-MM-DD e.g. 2026-01-10
    department_id        INTEGER NOT NULL REFERENCES workforce.departments (id) ON DELETE RESTRICT,
    shift_type           VARCHAR(30) NOT NULL
                         CHECK (shift_type IN ('MORNING', 'AFTERNOON', 'NIGHT', 'ON_CALL', 'EMERGENCY')),
    name_fa              VARCHAR(150) NOT NULL,
    start_time           TIME NOT NULL,
    end_time             TIME NOT NULL,
    status               VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
                         CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'RUNNING', 'COMPLETED', 'CANCELLED')),
    required_staff       INTEGER NOT NULL DEFAULT 1 CHECK (required_staff > 0),
    assigned_staff_count INTEGER NOT NULL DEFAULT 0,
    required_role        VARCHAR(120),
    required_skill       VARCHAR(100),
    notes                TEXT,
    created_by           UUID REFERENCES iam.users (id) ON DELETE SET NULL,
    approved_by          UUID REFERENCES iam.users (id) ON DELETE SET NULL,
    approved_at          TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_shift_instances_date ON shift.shift_instances (gregorian_date);
CREATE INDEX IF NOT EXISTS ix_shift_instances_jalali ON shift.shift_instances (jalali_date);
CREATE INDEX IF NOT EXISTS ix_shift_instances_dept ON shift.shift_instances (department_id);
CREATE INDEX IF NOT EXISTS ix_shift_instances_status ON shift.shift_instances (status);

DROP TRIGGER IF EXISTS trg_shift_instances_touch ON shift.shift_instances;
CREATE TRIGGER trg_shift_instances_touch BEFORE UPDATE ON shift.shift_instances
    FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();
