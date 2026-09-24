-- =============================================================================
-- HWDT-11 / HWDT-12  Migration 005 — reference data (departments, skills). Idempotent.
-- =============================================================================
INSERT INTO workforce.departments (name, description) VALUES
    ('ICU',            'Intensive Care Unit — critically ill adult patients'),
    ('Emergency',      'Emergency Department — 24/7 acute and trauma care'),
    ('Surgery',        'Operating theatres and peri-operative care'),
    ('Pediatrics',     'Inpatient and outpatient care for children'),
    ('NICU',           'Neonatal Intensive Care Unit'),
    ('Radiology',      'Diagnostic and interventional imaging'),
    ('Laboratory',     'Clinical pathology and laboratory medicine'),
    ('Pharmacy',       'Medication management and dispensing'),
    ('Nephrology',     'Renal care and dialysis unit'),
    ('Administration', 'Hospital administration and support services'),
    ('Human Resources','Workforce administration, recruitment and payroll')
ON CONFLICT DO NOTHING;

INSERT INTO workforce.skills (name, category) VALUES
    ('ACLS',                    'Life Support'),
    ('BLS',                     'Life Support'),
    ('PALS',                    'Life Support'),
    ('NRP',                     'Life Support'),
    ('Dialysis',                'Renal Care'),
    ('NICU Care',               'Neonatal Care'),
    ('Ventilator Management',   'Critical Care'),
    ('Triage',                  'Emergency Care'),
    ('IV Therapy',              'Nursing Procedures'),
    ('Wound Care',              'Nursing Procedures'),
    ('Phlebotomy',              'Diagnostics'),
    ('CT Imaging',              'Diagnostics'),
    ('Sterile Compounding',     'Pharmacy'),
    ('Anesthesia Support',      'Surgical Care'),
    ('EHR Documentation',       'Administrative'),
    ('Payroll Processing',      'Administrative'),
    ('Infection Control',       'Quality & Safety')
ON CONFLICT DO NOTHING;
