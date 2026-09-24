# API Documentation

Phase 0 contains no business APIs. This page documents the platform endpoints available now and the conventions for future APIs.

## Platform endpoints

| Endpoint | Via | Purpose |
|---|---|---|
| `GET http://localhost/nginx-health` | Nginx | Proxy liveness (`OK`) |
| `GET http://jira.local/status` | Nginx → Jira | `{"state":"RUNNING"}` / `FIRST_RUN` |
| `GET http://confluence.local/status` | Nginx → Confluence | `{"state":"RUNNING"}` |
| `GET http://monitoring.local/-/healthy` | Nginx → Prometheus | Prometheus liveness |
| `GET http://monitoring.local/api/v1/query?query=up` | Nginx → Prometheus | Scrape target status |

## Atlassian REST APIs used by the provisioner

| API | Endpoint | Use |
|---|---|---|
| Jira | `POST /rest/api/2/issuetype` | Custom issue types |
| Jira | `POST /rest/api/2/field` | Custom fields |
| Jira | `POST /rest/api/2/project` | HWDT project |
| Jira | `POST /rest/api/2/issue` | Epics |
| Jira | `GET /rest/api/2/status` | Status IDs for workflow XML |
| Confluence | `POST /rest/api/space` | Documentation space |
| Confluence | `POST/PUT /rest/api/content` | Pages |

## Conventions for future HWDT APIs

- REST, JSON, versioned path: `/api/v1/...`.
- OpenAPI 3.1 specification stored next to the service and published to this page.
- Authentication: OIDC bearer tokens (hospital identity provider) — no API keys in code.
- Errors: RFC 9457 problem+json.
- Pagination: `?page=&size=` with `X-Total-Count` header.
- Every endpoint must emit Prometheus metrics (`http_requests_total`, latency histogram).
