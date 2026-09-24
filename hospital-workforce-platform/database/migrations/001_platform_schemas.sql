-- =============================================================================
-- HWDT-9  Migration 001 — platform schemas + audit log
-- One PostgreSQL schema per bounded context (ready to split into microservices):
--   platform   : migrations bookkeeping, audit log
--   iam        : users / roles (authentication)
--   workforce  : departments, employees, skills        (Phase 1)
--   credential : professional credentials               (Phase 1)
--   (future)   : shift, matching, ai                     (Phase 2+)
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS platform;
CREATE SCHEMA IF NOT EXISTS iam;
CREATE SCHEMA IF NOT EXISTS workforce;
CREATE SCHEMA IF NOT EXISTS credential;

CREATE TABLE IF NOT EXISTS platform.audit_log (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_id     UUID,
    actor_email  VARCHAR(255),
    action       VARCHAR(60)  NOT NULL,          -- e.g. EMPLOYEE_CREATED, CREDENTIAL_VERIFIED
    entity_type  VARCHAR(60)  NOT NULL,
    entity_id    VARCHAR(64)  NOT NULL,
    changes      JSONB        NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS ix_audit_entity ON platform.audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS ix_audit_time   ON platform.audit_log (occurred_at DESC);

-- Shared trigger function: maintain updated_at
CREATE OR REPLACE FUNCTION platform.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;
