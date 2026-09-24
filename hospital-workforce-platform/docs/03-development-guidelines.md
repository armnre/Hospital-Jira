# Development Guidelines

## Branching & commits

- Trunk-based: `main` is always deployable; short-lived branches `feature/HWDT-123-short-title`, `bugfix/HWDT-456-...`, `infra/HWDT-789-...`.
- Every commit message starts with the Jira key: `HWDT-123: add credential expiry job`.
- Pull requests require one reviewer and a green validation run.

## Jira usage

- Every change has an issue; issues belong to an Epic (EPIC-001 ... EPIC-008).
- Fill **Module**, **Environment**, **Release Version** and **Priority Level**.
- Test Cases record **Test Result**; defects follow the Bug workflow (OPEN → ANALYSIS → FIXING → TESTING → CLOSED).
- Stories move through BACKLOG → ANALYSIS → READY FOR DEVELOPMENT → DEVELOPMENT → CODE REVIEW → QA TEST → UAT → DONE.

## Definition of Ready

1. Acceptance criteria written
2. Module and Epic assigned
3. Dependencies identified
4. Estimated

## Definition of Done

1. Code reviewed and merged
2. Automated tests pass
3. Documentation updated in Confluence
4. Deployed to the target Environment
5. QA and UAT accepted

## Infrastructure changes

- All infrastructure is code: edit files under `hospital-workforce-platform/`, never containers by hand.
- Pin every image version in `.env.example`.
- Run `./scripts/validate_environment.sh` before opening a PR.

## Data protection

- Never place real patient or employee personal data in Jira, Confluence, logs or test fixtures.
- Use synthetic data and the `Employee ID` reference only.
