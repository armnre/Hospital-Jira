-- =============================================================================
-- HWDT demo seed — synthetic data only (no real personal data).
-- Applied by the backend when HWDT_SEED_DEMO=true AND workforce.employees is empty.
-- Credential dates are relative to CURRENT_DATE so every status is always represented.
-- =============================================================================
INSERT INTO workforce.employees
    (employee_number, first_name, last_name, national_id, email, phone, department_id, job_title, employment_type, employee_category, status, hire_date)
SELECT v.num, v.fn, v.ln, v.nid, v.email, v.phone, d.id, v.title, v.etype, v.cat, v.status, CURRENT_DATE - (v.tenure_days || ' days')::interval
FROM (VALUES
    ('EMP-001001','Amira','Haddad','NID-784512001','amira.haddad@hwdt.local','+1-555-0101','ICU','Critical Care Nurse','FULL_TIME','CLINICAL','ACTIVE',2900),
    ('EMP-001002','Daniel','Okafor','NID-784512002','daniel.okafor@hwdt.local','+1-555-0102','ICU','Intensivist Physician','FULL_TIME','CLINICAL','ACTIVE',4100),
    ('EMP-001003','Sofia','Marquez','NID-784512003','sofia.marquez@hwdt.local','+1-555-0103','Emergency','Emergency Nurse','FULL_TIME','CLINICAL','ACTIVE',1500),
    ('EMP-001004','Liam','Chen','NID-784512004','liam.chen@hwdt.local','+1-555-0104','Emergency','Emergency Physician','FULL_TIME','CLINICAL','ACTIVE',2300),
    ('EMP-001005','Fatima','Al-Sayed','NID-784512005','fatima.alsayed@hwdt.local','+1-555-0105','Emergency','Paramedic','CONTRACT','CLINICAL','ACTIVE',700),
    ('EMP-001006','Noah','Williams','NID-784512006','noah.williams@hwdt.local','+1-555-0106','Surgery','Surgeon','FULL_TIME','CLINICAL','ACTIVE',5200),
    ('EMP-001007','Grace','Kim','NID-784512007','grace.kim@hwdt.local','+1-555-0107','Surgery','Theatre Nurse','FULL_TIME','CLINICAL','ACTIVE',1900),
    ('EMP-001008','Omar','Rahman','NID-784512008','omar.rahman@hwdt.local','+1-555-0108','Surgery','Anesthesia Technician','PART_TIME','CLINICAL','ACTIVE',1100),
    ('EMP-001009','Chloe','Dubois','NID-784512009','chloe.dubois@hwdt.local','+1-555-0109','Pediatrics','Pediatric Nurse','FULL_TIME','CLINICAL','ACTIVE',2600),
    ('EMP-001010','Mateo','Rossi','NID-784512010','mateo.rossi@hwdt.local','+1-555-0110','Pediatrics','Pediatrician','FULL_TIME','CLINICAL','ON_LEAVE',3800),
    ('EMP-001011','Aisha','Bello','NID-784512011','aisha.bello@hwdt.local','+1-555-0111','NICU','Neonatal Nurse','FULL_TIME','CLINICAL','ACTIVE',2100),
    ('EMP-001012','Ethan','Novak','NID-784512012','ethan.novak@hwdt.local','+1-555-0112','NICU','Neonatologist','LOCUM','CLINICAL','ACTIVE',400),
    ('EMP-001013','Hannah','Schmidt','NID-784512013','hannah.schmidt@hwdt.local','+1-555-0113','Radiology','Radiographer','FULL_TIME','CLINICAL','ACTIVE',3000),
    ('EMP-001014','Yusuf','Demir','NID-784512014','yusuf.demir@hwdt.local','+1-555-0114','Laboratory','Medical Laboratory Scientist','FULL_TIME','CLINICAL','ACTIVE',1700),
    ('EMP-001015','Isabella','Costa','NID-784512015','isabella.costa@hwdt.local','+1-555-0115','Pharmacy','Clinical Pharmacist','FULL_TIME','CLINICAL','ACTIVE',2500),
    ('EMP-001016','Kwame','Mensah','NID-784512016','kwame.mensah@hwdt.local','+1-555-0116','Nephrology','Dialysis Nurse','FULL_TIME','CLINICAL','ACTIVE',3300),
    ('EMP-001017','Mei','Tanaka','NID-784512017','mei.tanaka@hwdt.local','+1-555-0117','Nephrology','Nephrologist','PART_TIME','CLINICAL','ACTIVE',4600),
    ('EMP-001018','Lucas','Moreau','NID-784512018','lucas.moreau@hwdt.local','+1-555-0118','ICU','Respiratory Therapist','FULL_TIME','CLINICAL','SUSPENDED',1300),
    ('EMP-001019','Sara','Lindqvist','NID-784512019','sara.lindqvist@hwdt.local','+1-555-0119','Administration','Ward Clerk','FULL_TIME','NON_CLINICAL','ACTIVE',2000),
    ('EMP-001020','Ahmed','Farouk','NID-784512020','ahmed.farouk@hwdt.local','+1-555-0120','Administration','Facilities Manager','FULL_TIME','NON_CLINICAL','ACTIVE',3600),
    ('EMP-001021','Olivia','Brown','NID-784512021','olivia.brown@hwdt.local','+1-555-0121','Human Resources','HR Business Partner','FULL_TIME','NON_CLINICAL','ACTIVE',2800),
    ('EMP-001022','Ravi','Patel','NID-784512022','ravi.patel@hwdt.local','+1-555-0122','Human Resources','Payroll Specialist','PART_TIME','NON_CLINICAL','ACTIVE',900),
    ('EMP-001023','Elena','Popescu','NID-784512023','elena.popescu@hwdt.local','+1-555-0123','Administration','Medical Records Officer','CONTRACT','NON_CLINICAL','ACTIVE',600),
    ('EMP-001024','Jonas','Berg','NID-784512024','jonas.berg@hwdt.local','+1-555-0124','Emergency','Emergency Nurse','INTERN','CLINICAL','ACTIVE',120)
) AS v(num, fn, ln, nid, email, phone, dept, title, etype, cat, status, tenure_days)
JOIN workforce.departments d ON d.name = v.dept;

-- Skills
INSERT INTO workforce.employee_skills (employee_id, skill_id, level, years_experience)
SELECT e.id, s.id, v.lvl, v.yrs
FROM (VALUES
    ('EMP-001001','ACLS','ADVANCED',7),('EMP-001001','Ventilator Management','EXPERT',8),('EMP-001001','IV Therapy','EXPERT',8),
    ('EMP-001002','ACLS','EXPERT',11),('EMP-001002','Ventilator Management','EXPERT',11),
    ('EMP-001003','Triage','ADVANCED',4),('EMP-001003','BLS','ADVANCED',4),('EMP-001003','IV Therapy','INTERMEDIATE',4),
    ('EMP-001004','ACLS','EXPERT',6),('EMP-001004','Triage','EXPERT',6),
    ('EMP-001005','BLS','EXPERT',2),('EMP-001005','Triage','INTERMEDIATE',2),
    ('EMP-001006','ACLS','ADVANCED',14),('EMP-001006','Infection Control','ADVANCED',14),
    ('EMP-001007','Anesthesia Support','ADVANCED',5),('EMP-001007','Infection Control','EXPERT',5),
    ('EMP-001008','Anesthesia Support','INTERMEDIATE',3),
    ('EMP-001009','PALS','ADVANCED',7),('EMP-001009','IV Therapy','ADVANCED',7),
    ('EMP-001010','PALS','EXPERT',10),
    ('EMP-001011','NICU Care','EXPERT',6),('EMP-001011','NRP','ADVANCED',6),
    ('EMP-001012','NICU Care','ADVANCED',9),('EMP-001012','NRP','EXPERT',9),
    ('EMP-001013','CT Imaging','EXPERT',8),
    ('EMP-001014','Phlebotomy','ADVANCED',5),
    ('EMP-001015','Sterile Compounding','ADVANCED',7),
    ('EMP-001016','Dialysis','EXPERT',9),('EMP-001016','BLS','ADVANCED',9),
    ('EMP-001017','Dialysis','EXPERT',12),
    ('EMP-001018','Ventilator Management','ADVANCED',3.5),
    ('EMP-001019','EHR Documentation','ADVANCED',5),
    ('EMP-001021','Payroll Processing','INTERMEDIATE',3),
    ('EMP-001022','Payroll Processing','EXPERT',6),
    ('EMP-001023','EHR Documentation','INTERMEDIATE',1.5),
    ('EMP-001024','BLS','BEGINNER',0.5)
) AS v(num, skill, lvl, yrs)
JOIN workforce.employees e ON e.employee_number = v.num AND e.deleted_at IS NULL
JOIN workforce.skills s ON s.name = v.skill
ON CONFLICT DO NOTHING;

-- Credentials: expiry offsets (days from today) produce every status. verified = verified at import.
INSERT INTO credential.credentials
    (employee_id, credential_type, credential_name, credential_number, issuer, issue_date, expiry_date, document_reference, verified_at)
SELECT e.id, v.ctype, v.cname, v.cnum, v.issuer,
       CURRENT_DATE - v.issued_ago,
       CASE WHEN v.expires_in IS NULL THEN NULL ELSE CURRENT_DATE + v.expires_in END,
       'dms://credentials/' || v.num || '/' || lower(replace(v.cname, ' ', '-')) || '.pdf',
       CASE WHEN v.verified THEN now() - interval '30 days' ELSE NULL END
FROM (VALUES
    ('EMP-001001','PROFESSIONAL_LICENSE','Registered Nurse License','RN-448812','State Board of Nursing',700,395,true),
    ('EMP-001001','CERTIFICATION','ACLS Provider','ACLS-99120','American Heart Association',680,20,true),
    ('EMP-001002','PROFESSIONAL_LICENSE','Medical License','MD-201145','State Medical Board',1000,610,true),
    ('EMP-001002','CERTIFICATION','Critical Care Board Certification','CCM-5561','Board of Internal Medicine',2000,900,true),
    ('EMP-001003','PROFESSIONAL_LICENSE','Registered Nurse License','RN-551203','State Board of Nursing',720,-12,true),
    ('EMP-001003','CERTIFICATION','BLS Provider','BLS-77310','American Heart Association',300,430,true),
    ('EMP-001004','PROFESSIONAL_LICENSE','Medical License','MD-309981','State Medical Board',800,48,true),
    ('EMP-001004','CERTIFICATION','ACLS Provider','ACLS-10293','American Heart Association',600,130,true),
    ('EMP-001005','REGISTRATION','Paramedic Registration','PM-66021','National EMS Registry',365,280,true),
    ('EMP-001005','CERTIFICATION','BLS Provider','BLS-88121','American Heart Association',700,-40,true),
    ('EMP-001006','PROFESSIONAL_LICENSE','Medical License','MD-100872','State Medical Board',1500,700,true),
    ('EMP-001006','CERTIFICATION','ACLS Provider','ACLS-44120','American Heart Association',700,9,true),
    ('EMP-001007','PROFESSIONAL_LICENSE','Registered Nurse License','RN-661190','State Board of Nursing',400,540,true),
    ('EMP-001008','CERTIFICATION','Anesthesia Technologist Certification','CerATT-2210','ASATT',500,220,false),
    ('EMP-001009','PROFESSIONAL_LICENSE','Registered Nurse License','RN-712334','State Board of Nursing',650,59,true),
    ('EMP-001009','CERTIFICATION','PALS Provider','PALS-55102','American Heart Association',400,330,true),
    ('EMP-001010','PROFESSIONAL_LICENSE','Medical License','MD-402287','State Medical Board',900,-95,true),
    ('EMP-001011','PROFESSIONAL_LICENSE','Registered Nurse License','RN-812290','State Board of Nursing',300,760,true),
    ('EMP-001011','CERTIFICATION','NRP Provider','NRP-33019','American Academy of Pediatrics',690,28,true),
    ('EMP-001012','PROFESSIONAL_LICENSE','Medical License','MD-505512','State Medical Board',200,1300,false),
    ('EMP-001013','REGISTRATION','Radiographer Registration','RAD-77120','Health & Care Professions Council',500,230,true),
    ('EMP-001014','PROFESSIONAL_LICENSE','Clinical Laboratory Scientist License','CLS-22091','State Department of Health',800,61,true),
    ('EMP-001015','PROFESSIONAL_LICENSE','Pharmacist License','RPH-99012','State Board of Pharmacy',700,15,true),
    ('EMP-001016','PROFESSIONAL_LICENSE','Registered Nurse License','RN-900127','State Board of Nursing',500,440,true),
    ('EMP-001016','CERTIFICATION','Certified Dialysis Nurse','CDN-4411','Nephrology Nursing Certification Commission',900,-3,true),
    ('EMP-001017','PROFESSIONAL_LICENSE','Medical License','MD-600341','State Medical Board',1200,820,true),
    ('EMP-001018','PROFESSIONAL_LICENSE','Respiratory Therapist License','RRT-11209','State Respiratory Care Board',1400,-210,true),
    ('EMP-001019','TRAINING','Fire Safety Training','FS-2026-019','Hospital Safety Office',200,165,true),
    ('EMP-001021','CERTIFICATION','SHRM Certified Professional','SHRM-CP-8812','SHRM',600,760,true),
    ('EMP-001023','TRAINING','Data Protection Training','DP-2026-023','Information Governance Office',400,-20,true),
    ('EMP-001024','CERTIFICATION','BLS Provider','BLS-99001','American Heart Association',30,700,false)
) AS v(num, ctype, cname, cnum, issuer, issued_ago, expires_in, verified)
JOIN workforce.employees e ON e.employee_number = v.num AND e.deleted_at IS NULL;
