-- =============================================================================
-- HWDT-13 / HWDT-14 / HWDT-15  Migration 004 — Credential Management
--   credential.credentials          : base table
--   credential.v_credentials        : status ALWAYS computed from today's date (Business Rules 1 & 2)
--   workforce.v_employee_compliance : per-employee compliance (Business Rule 3)
--
-- Status rule (identical to backend/src/modules/credentials/credential.rules.ts):
--   expiry_date <  today                  -> EXPIRED              (Rule 2: overrides everything)
--   verified_at IS NULL                   -> PENDING_VERIFICATION
--   expiry_date <= today + 60 days        -> EXPIRING_SOON
--   otherwise (incl. no expiry date)      -> VALID
-- =============================================================================
CREATE TABLE IF NOT EXISTS credential.credentials (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id         UUID         NOT NULL REFERENCES workforce.employees (id) ON DELETE CASCADE,
    credential_type     VARCHAR(30)  NOT NULL
                        CHECK (credential_type IN ('PROFESSIONAL_LICENSE', 'REGISTRATION', 'CERTIFICATION', 'TRAINING', 'OTHER')),
    credential_name     VARCHAR(200) NOT NULL,
    credential_number   VARCHAR(100) NOT NULL DEFAULT '',
    issuer              VARCHAR(200) NOT NULL,
    issue_date          DATE         NOT NULL,
    expiry_date         DATE,                               -- NULL = does not expire
    status              VARCHAR(25)  NOT NULL DEFAULT 'PENDING_VERIFICATION'
                        CHECK (status IN ('VALID', 'EXPIRING_SOON', 'EXPIRED', 'PENDING_VERIFICATION')),
    document_reference  VARCHAR(500) NOT NULL DEFAULT '',
    verified_by         UUID REFERENCES iam.users (id) ON DELETE SET NULL,
    verified_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_credential_dates CHECK (expiry_date IS NULL OR expiry_date >= issue_date),
    CONSTRAINT ck_verification_pair CHECK ((verified_by IS NULL) = (verified_at IS NULL) OR verified_by IS NULL)
);
CREATE INDEX IF NOT EXISTS ix_credentials_employee ON credential.credentials (employee_id);
CREATE INDEX IF NOT EXISTS ix_credentials_expiry   ON credential.credentials (expiry_date) WHERE expiry_date IS NOT NULL;

DROP TRIGGER IF EXISTS trg_credentials_touch ON credential.credentials;
CREATE TRIGGER trg_credentials_touch BEFORE UPDATE ON credential.credentials
    FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- Single SQL definition of the status rule
CREATE OR REPLACE FUNCTION credential.compute_status(p_expiry DATE, p_verified_at TIMESTAMPTZ, p_today DATE DEFAULT CURRENT_DATE)
RETURNS VARCHAR LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN p_expiry IS NOT NULL AND p_expiry < p_today        THEN 'EXPIRED'
        WHEN p_verified_at IS NULL                              THEN 'PENDING_VERIFICATION'
        WHEN p_expiry IS NOT NULL AND p_expiry <= p_today + 60  THEN 'EXPIRING_SOON'
        ELSE 'VALID'
    END
$$;

CREATE OR REPLACE VIEW credential.v_credentials AS
SELECT c.*,
       credential.compute_status(c.expiry_date, c.verified_at, CURRENT_DATE) AS computed_status,
       CASE WHEN c.expiry_date IS NULL THEN NULL ELSE (c.expiry_date - CURRENT_DATE) END AS days_until_expiry
FROM credential.credentials c;

-- Per-employee compliance (Rule 3: clinical staff require a current professional licence/registration)
CREATE OR REPLACE VIEW workforce.v_employee_compliance AS
SELECT e.id AS employee_id,
       e.employee_category,
       count(c.id)::int                                                                   AS total_credentials,
       count(c.id) FILTER (WHERE c.computed_status = 'VALID')::int                        AS valid_count,
       count(c.id) FILTER (WHERE c.computed_status = 'EXPIRING_SOON')::int                AS expiring_count,
       count(c.id) FILTER (WHERE c.computed_status = 'EXPIRED')::int                      AS expired_count,
       count(c.id) FILTER (WHERE c.computed_status = 'PENDING_VERIFICATION')::int         AS pending_count,
       count(c.id) FILTER (WHERE c.credential_type IN ('PROFESSIONAL_LICENSE', 'REGISTRATION')
                              AND c.computed_status IN ('VALID', 'EXPIRING_SOON'))::int    AS active_license_count
FROM workforce.employees e
LEFT JOIN credential.v_credentials c ON c.employee_id = e.id
WHERE e.deleted_at IS NULL
GROUP BY e.id, e.employee_category;
