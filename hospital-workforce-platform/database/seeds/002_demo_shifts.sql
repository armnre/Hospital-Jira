-- =============================================================================
-- HWDT Phase 2 — Demo Shifts, Availability, and Staff Assignments Seed
-- Generates realistic active hospital shifts for Iranian hospital workflows
-- Evaluated dynamically relative to CURRENT_DATE so shifts are always in current calendar
-- =============================================================================

-- 1. Seed Employee Availability around CURRENT_DATE
INSERT INTO shift.employee_availability (employee_id, date, jalali_date, available, reason, notes)
SELECT e.id,
       CURRENT_DATE + v.offset,
       shift.gregorian_to_jalali(CURRENT_DATE + v.offset),
       v.avail,
       v.reason,
       v.notes
FROM (VALUES
    ('EMP-001001', 0, true,  'AVAILABLE', 'شیفت صبح در دسترس'),
    ('EMP-001001', 1, true,  'AVAILABLE', 'در دسترس'),
    ('EMP-001002', 0, true,  'AVAILABLE', 'آماده کشیک مراقبت‌های ویژه'),
    ('EMP-001003', 1, false, 'VACATION', 'درخواست مرخصی استحقاقی سالانه - تایید سرپرستار'),
    ('EMP-001003', 2, false, 'VACATION', 'مرخصی استحقاقی'),
    ('EMP-001004', 0, true,  'AVAILABLE', 'حاضر در اورژانس'),
    ('EMP-001005', 0, true,  'AVAILABLE', 'کادر امداد و انتقال'),
    ('EMP-001006', 0, true,  'AVAILABLE', 'جراح مقیم شیفت صبح'),
    ('EMP-001007', 0, true,  'AVAILABLE', 'پرستار اتاق عمل'),
    ('EMP-001008', 0, false, 'TRAINING', 'شرکت در کارگاه بازآموزی احیای قلبی ریوی'),
    ('EMP-001009', 0, true,  'AVAILABLE', 'پرستار بخش اطفال'),
    ('EMP-001010', 0, false, 'MEDICAL_LEAVE', 'مرخصی استعلاجی با گواهی پزشک'),
    ('EMP-001011', 0, true,  'AVAILABLE', 'پرستار مراقبت ویژه نوزادان'),
    ('EMP-001012', 0, true,  'AVAILABLE', 'پزشک فوق تخصص نوزادان'),
    ('EMP-001013', 0, true,  'AVAILABLE', 'کارشناس رادیولوژی'),
    ('EMP-001014', 0, true,  'AVAILABLE', 'کارشناس آزمایشگاه'),
    ('EMP-001015', 0, true,  'AVAILABLE', 'داروساز بالینی'),
    ('EMP-001016', 0, true,  'AVAILABLE', 'پرستار همودیالیز')
) AS v(emp_num, offset, avail, reason, notes)
JOIN workforce.employees e ON e.employee_number = v.emp_num AND e.deleted_at IS NULL
ON CONFLICT (employee_id, date) DO NOTHING;

-- 2. Seed Shift Instances on CURRENT_DATE, Yesterday, Tomorrow, and upcoming days
WITH seeded_instances AS (
    INSERT INTO shift.shift_instances
        (template_id, jalali_date, gregorian_date, department_id, shift_type, name_fa, start_time, end_time, status, required_staff, required_role, required_skill, notes)
    SELECT
        st.id,
        shift.gregorian_to_jalali(CURRENT_DATE + v.date_offset),
        CURRENT_DATE + v.date_offset,
        d.id,
        v.stype,
        v.name_fa,
        v.t_start::time,
        v.t_end::time,
        v.status,
        v.req_staff,
        v.req_role,
        v.req_skill,
        v.notes
    FROM (VALUES
        -- TODAY (امروز)
        ('ICU', 'MORNING',   'شیفت صبح ICU - مراقبت ویژه',   '07:30', '14:00', 'RUNNING',          4, 'Critical Care Nurse', 'Ventilator Management', 0, 'پوشش کامل تخت‌های حاد ICU'),
        ('ICU', 'AFTERNOON', 'شیفت عصر ICU - مراقبت ویژه',   '13:30', '20:00', 'APPROVED',         3, 'Critical Care Nurse', 'Ventilator Management', 0, 'تحویل بیماران و ویزیت عصرگاهی'),
        ('ICU', 'NIGHT',     'شیفت شب کشیک ICU',            '19:30', '08:00', 'PENDING_APPROVAL', 3, 'Critical Care Nurse', 'ACLS',                  0, 'شیفت کشیک شبانه بخش مراقبت‌های ویژه'),
        ('Emergency', 'MORNING',   'شیفت صبح اورژانس عمومی', '07:30', '14:00', 'RUNNING',          5, 'Emergency Nurse',     'Triage',                0, 'پذیرش بیماران حاد و تصادفات'),
        ('Emergency', 'AFTERNOON', 'شیفت عصر اورژانس',       '13:30', '20:00', 'APPROVED',         4, 'Emergency Nurse',     'Triage',                0, 'پوشش پیک مراجعات عصرگاهی'),
        ('Emergency', 'NIGHT',     'شیفت شب اورژانس و احیا', '19:30', '08:00', 'PENDING_APPROVAL', 4, 'Emergency Nurse',     'ACLS',                  0, 'تیم واکنش سریع و احیا'),
        ('Surgery', 'MORNING',   'شیفت صبح اتاق عمل و جراحی','07:30', '15:30', 'APPROVED',         4, 'Theatre Nurse',       'Anesthesia Support',    0, 'جراحی‌های الکتیو برنامه هفتگی'),
        ('Pediatrics', 'MORNING', 'شیفت صبح بخش کودکان',     '07:30', '14:00', 'APPROVED',         3, 'Pediatric Nurse',     'PALS',                  0, 'بستری اطفال و تزریقات'),
        ('NICU', 'MORNING',      'شیفت صبح مراقبت نوزادان',  '07:30', '14:00', 'APPROVED',         3, 'Neonatal Nurse',      'NICU Care',             0, 'پوشش انکوباتورهای مراقبت ویژه'),

        -- TOMORROW (فردا)
        ('ICU', 'MORNING',   'شیفت صبح ICU',   '07:30', '14:00', 'APPROVED',         4, 'Critical Care Nurse', 'Ventilator Management', 1, 'برنامه فردا صبح'),
        ('ICU', 'NIGHT',     'شیفت شب ICU',     '19:30', '08:00', 'PENDING_APPROVAL', 3, 'Critical Care Nurse', 'ACLS',                  1, 'نیازمند تکمیل کادر کشیک'),
        ('Emergency', 'MORNING', 'شیفت صبح اورژانس', '07:30', '14:00', 'APPROVED',   5, 'Emergency Nurse',     'Triage',                1, 'برنامه فردا اورژانس'),
        ('Surgery', 'MORNING', 'شیفت صبح اتاق عمل', '07:30', '15:30', 'PENDING_APPROVAL', 4, 'Theatre Nurse', 'Anesthesia Support',    1, 'جراحی‌های فردا'),

        -- DAY AFTER TOMORROW (+2)
        ('ICU', 'MORNING', 'شیفت صبح ICU', '07:30', '14:00', 'DRAFT', 4, 'Critical Care Nurse', 'Ventilator Management', 2, 'پیش‌نویس برنامه'),
        ('Emergency', 'MORNING', 'شیفت صبح اورژانس', '07:30', '14:00', 'DRAFT', 5, 'Emergency Nurse', 'Triage', 2, 'پیش‌نویس برنامه'),

        -- YESTERDAY (-1) - COMPLETED
        ('ICU', 'MORNING', 'شیفت صبح ICU دیروز', '07:30', '14:00', 'COMPLETED', 4, 'Critical Care Nurse', 'Ventilator Management', -1, 'انجام و ثبت گزارش شیفت'),
        ('Emergency', 'MORNING', 'شیفت صبح اورژانس دیروز', '07:30', '14:00', 'COMPLETED', 5, 'Emergency Nurse', 'Triage', -1, 'تکمیل شده')
    ) AS v(dept_name, stype, name_fa, t_start, t_end, status, req_staff, req_role, req_skill, date_offset, notes)
    JOIN workforce.departments d ON lower(d.name) = lower(v.dept_name)
    LEFT JOIN shift.shift_templates st ON st.department_id = d.id AND st.shift_type = v.stype
    RETURNING id, name_fa, department_id, gregorian_date, shift_type
)
SELECT count(*) FROM seeded_instances;

-- 3. Assign Staff to Today's Shifts
-- Assign Amira Haddad & Daniel Okafor to ICU Morning Today
INSERT INTO shift.shift_assignments (shift_id, employee_id, status, notes)
SELECT si.id, e.id, 'CONFIRMED', 'تخصیص سرپرستار شیفت'
FROM shift.shift_instances si
JOIN workforce.departments d ON d.id = si.department_id
JOIN workforce.employees e ON e.employee_number IN ('EMP-001001', 'EMP-001002')
WHERE si.gregorian_date = CURRENT_DATE
  AND d.name = 'ICU'
  AND si.shift_type = 'MORNING'
ON CONFLICT DO NOTHING;

-- Assign Liam Chen and Fatima Al-Sayed to Emergency Morning Today
INSERT INTO shift.shift_assignments (shift_id, employee_id, status, notes)
SELECT si.id, e.id, 'CONFIRMED', 'پزشک و کادر اورژانس'
FROM shift.shift_instances si
JOIN workforce.departments d ON d.id = si.department_id
JOIN workforce.employees e ON e.employee_number IN ('EMP-001004', 'EMP-001005')
WHERE si.gregorian_date = CURRENT_DATE
  AND d.name = 'Emergency'
  AND si.shift_type = 'MORNING'
ON CONFLICT DO NOTHING;

-- Assign Grace Kim to Surgery Morning Today
INSERT INTO shift.shift_assignments (shift_id, employee_id, status, notes)
SELECT si.id, e.id, 'CONFIRMED', 'پرستار اسکراب'
FROM shift.shift_instances si
JOIN workforce.departments d ON d.id = si.department_id
JOIN workforce.employees e ON e.employee_number = 'EMP-001007'
WHERE si.gregorian_date = CURRENT_DATE
  AND d.name = 'Surgery'
  AND si.shift_type = 'MORNING'
ON CONFLICT DO NOTHING;

-- Assign Aisha Bello to NICU Morning Today
INSERT INTO shift.shift_assignments (shift_id, employee_id, status, notes)
SELECT si.id, e.id, 'CONFIRMED', 'پرستار مراقبت ویژه نوزادان'
FROM shift.shift_instances si
JOIN workforce.departments d ON d.id = si.department_id
JOIN workforce.employees e ON e.employee_number = 'EMP-001011'
WHERE si.gregorian_date = CURRENT_DATE
  AND d.name = 'NICU'
  AND si.shift_type = 'MORNING'
ON CONFLICT DO NOTHING;
