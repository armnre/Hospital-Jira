# Backup Strategy

## Objectives

| Metric | Target (Phase 0) |
|---|---|
| RPO (max data loss) | 24 hours |
| RTO (max restore time) | 1 hour |
| Retention | 7 days local (configurable `BACKUP_RETENTION_DAYS`) |
| Restore verification | weekly automated + on demand |

## What is backed up

| Item | Method | Location |
|---|---|---|
| jira_db | `pg_dump --format=custom --compress=6` | `postgres/backups/jira_db/` |
| confluence_db | `pg_dump --format=custom --compress=6` | `postgres/backups/confluence_db/` |
| Roles (no passwords) | `pg_dumpall --globals-only --no-role-passwords` | `postgres/backups/globals/` |
| Jira / Confluence home (attachments) | `docker run --rm -v hwdt_jira_data:/d ... tar` (see below) | operator-defined |

Each dump has a `.sha256` checksum. Successful runs write `postgres/backups/.last_success` (epoch) which the backup container health check uses.

## Automation

The `backup` service runs `scripts/backup_scheduler.sh`: one backup at start, then every `BACKUP_INTERVAL_SECONDS` (default 86400), plus an automatic restore test each Sunday.

## Manual commands

```bash
./scripts/backup_database.sh                       # all databases
./scripts/backup_database.sh jira_db               # one database
./scripts/test_restore.sh                          # non-destructive restore test
docker compose stop jira                           # before a real restore
./scripts/restore_database.sh latest:jira_db jira_db --force
docker compose start jira
```

## Restore test procedure

`test_restore.sh` restores the latest dump into `<db>_restore_test`, compares the table list and exact row count of every table with the source database, and drops the scratch database. Any difference fails the test.

## Application home directories

```bash
docker run --rm -v hwdt_jira_data:/data -v "$PWD/postgres/backups":/out alpine \
  tar czf /out/jira_home_$(date -u +%Y%m%dT%H%M%SZ).tgz -C /data .
```

## Off-site copies (next phase)

Sync `postgres/backups/` to encrypted object storage (e.g. `restic` or `rclone` with server-side encryption).
