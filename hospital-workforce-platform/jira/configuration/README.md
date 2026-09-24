# Jira configuration-as-code

| File | Content |
|---|---|
| `hwdt-project.json` | Project HWDT, issue types, custom fields, versions, workflows, workflow scheme, permission scheme, epics |
| `workflows/hwdt-delivery-workflow.xml` | Rendered OSWorkflow template (status ID placeholders) |
| `workflows/hwdt-bug-workflow.xml` | Rendered OSWorkflow template (status ID placeholders) |

Apply: `docker compose --profile provision run --rm provisioner`

The provisioner re-renders the workflow XML with the real status IDs of your instance into `/tmp/hwdt-workflows` inside the container. To render offline:

```bash
python3 scripts/provision/provision_jira.py --render-only
```

## What is automated vs. manual (Jira Data Center REST limits)

| Item | Automated | Notes |
|---|---|---|
| Issue types | ✅ | `POST /rest/api/2/issuetype` |
| Custom fields | ✅ | `POST /rest/api/2/field` |
| Select options | ⚠️ best effort | DC has no official option API — provisioner prints the list if it cannot add them |
| Project, components, versions | ✅ | |
| Epics EPIC-001..008 | ✅ | label `epic-00x` makes it idempotent |
| Statuses | ❌ manual | Admin → Issues → Statuses (provisioner lists missing ones) |
| Workflows | ⚠️ XML import | Admin → Issues → Workflows → Import from XML |
| Workflow / permission schemes | ❌ manual | definitions in `hwdt-project.json` |
