-- =============================================================================
-- HWDT Phase 2 — Migration 008: Employee Availability & Standard Shift Templates
-- Table: shift.employee_availability
-- Reasons:
--   AVAILABLE (در دسترس)
--   UNAVAILABLE (عدم دسترسی)
--   VACATION (مرخصی استحقاقی)
--   MEDICAL_LEAVE (مرخصی استعلاجی / پزشکی)
--   TRAINING (دوره آموزشی / بازآموزی)
-- =============================================================================

CREATE TABLE IF NOT EXISTS shift.employee_availability (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id          UUID NOT NULL REFERENCES workforce.employees (id) ON DELETE CASCADE,
    date                 DATE NOT NULL,
    jalali_date          VARCHAR(10) NOT NULL, -- e.g. 1404/10/20
    available            BOOLEAN NOT NULL DEFAULT TRUE,
    reason               VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE'
                         CHECK (reason IN ('AVAILABLE', 'UNAVAILABLE', 'VACATION', 'MEDICAL_LEAVE', 'TRAINING')),
    notes                TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_employee_date UNIQUE (employee_id, date)
);

CREATE INDEX IF NOT EXISTS ix_availability_emp_date ON shift.employee_availability (employee_id, date);
CREATE INDEX IF NOT EXISTS ix_availability_date ON shift.employee_availability (date);

DROP TRIGGER IF EXISTS trg_employee_availability_touch ON shift.employee_availability;
CREATE TRIGGER trg_employee_availability_touch BEFORE UPDATE ON shift.employee_availability
    FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- Seed standard shift templates for Iranian hospital departments (Morning: 07:30-14:00, Afternoon: 13:30-20:00, Night: 19:30-08:00)
INSERT INTO shift.shift_templates (name_fa, department_id, shift_type, start_time, end_time, required_staff_count, required_role, required_skill, description)
SELECT t.name_fa, d.id, t.shift_type, t.start_time::time, t.end_time::time, t.count, t.role, t.skill, t.description_text
FROM (VALUES
    ('شیفت صبح ICU', 'ICU', 'MORNING', '07:30', '14:00', 4, 'Critical Care Nurse', 'Ventilator Management', 'شیفت صبح بخش مراقبت‌های ویژه با حضور پرستاران ارشد'),
    ('شیفت عصر ICU', 'ICU', 'AFTERNOON', '13:30', '20:00', 3, 'Critical Care Nurse', 'Ventilator Management', 'شیفت عصر بخش مراقبت‌های ویژه'),
    ('شیفت شب ICU', 'ICU', 'NIGHT', '19:30', '08:00', 3, 'Critical Care Nurse', 'ACLS', 'شیفت شب کشیک بخش مراقبت‌های ویژه'),
    ('شیفت صبح اورژانس', 'Emergency', 'MORNING', '07:30', '14:00', 5, 'Emergency Nurse', 'Triage', 'شیفت تریاژ و رسیدگی حاد در اورژانس'),
    ('شیفت عصر اورژانس', 'Emergency', 'AFTERNOON', '13:30', '20:00', 4, 'Emergency Nurse', 'Triage', 'پوشش عصر اورژانس و پذیرش تروما'),
    ('شیفت شب اورژانس', 'Emergency', 'NIGHT', '19:30', '08:00', 4, 'Emergency Nurse', 'ACLS', 'پوشش شبانه ۲۴ ساعته اورژانس و کد احیا'),
    ('شیفت صبح اتاق عمل', 'Surgery', 'MORNING', '07:30', '15:30', 4, 'Theatre Nurse', 'Anesthesia Support', 'اعمال جراحی الکتیو و اورژانس صبح'),
    ('شیفت عصر اتاق عمل', 'Surgery', 'AFTERNOON', '14:00', '21:00', 2, 'Theatre Nurse', 'Anesthesia Support', 'پوشش جراحی‌های عصر و موارد ارجاعی'),
    ('شیفت آنکال اتاق عمل', 'Surgery', 'ON_CALL', '20:00', '08:00', 2, 'Surgeon', 'Anesthesia Support', 'آماده‌باش آنکال فوریت‌های جراحی'),
    ('شیفت صبح کودکان', 'Pediatrics', 'MORNING', '07:30', '14:00', 3, 'Pediatric Nurse', 'PALS', 'مراقبت‌های بخش بستری کودکان'),
    ('شیفت صبح NICU', 'NICU', 'MORNING', '07:30', '14:00', 3, 'Neonatal Nurse', 'NICU Care', 'مراقبت ویژه انکوباتور نوزادان نارس'),
    ('شیفت اضطراری تروما', 'Emergency', 'EMERGENCY', '08:00', '20:00', 6, 'Emergency Physician', 'ACLS', 'شیفت فعال بحران و حوادث غیرمترقبه')
) AS t(name_fa, dept_name, shift_type, start_time, end_time, count, role, skill, description_text)
JOIN workforce.departments d ON lower(d.name) = lower(t.dept_name)
ON CONFLICT DO NOTHING;
