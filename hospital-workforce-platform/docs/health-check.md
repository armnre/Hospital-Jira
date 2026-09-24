# Health Check & Monitoring

## Layers

| Layer | What | How |
|---|---|---|
| Docker health checks | Each container self-reports `healthy` | `healthcheck:` blocks in docker-compose.yml |
| Health script | Status, CPU, memory, disk, endpoints, DB, backups | `./scripts/health_check.sh` |
| Prometheus | Time series + alert rules | `http://monitoring.local` |

## Container health checks

| Service | Check | Interval | Start period |
|---|---|---|---|
| postgres | `pg_isready` + `select 1` | 10s | 30s |
| jira | `curl /status` contains RUNNING or FIRST_RUN | 30s | 300s |
| confluence | `curl /status` contains RUNNING or FIRST_RUN | 30s | 300s |
| nginx | `wget /nginx-health` = OK | 15s | 10s |
| backup | `.last_success` younger than 2 × interval | 60s | 120s |
| prometheus | `/-/healthy` | 30s | 20s |
| cadvisor | `/healthz` | 30s | 20s |
| node-exporter | `/metrics` | 30s | 10s |

All services use `restart: unless-stopped`.

## Metrics monitored

| Metric | Source | Example PromQL |
|---|---|---|
| Container status | cAdvisor | `time() - container_last_seen{name=~"hwdt-.*"}` |
| Container CPU | cAdvisor | `sum by (name)(rate(container_cpu_usage_seconds_total{name=~"hwdt-.*"}[5m]))*100` |
| Container memory | cAdvisor | `container_memory_working_set_bytes{name=~"hwdt-.*"}` |
| Host CPU | node-exporter | `100 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m]))*100` |
| Host memory | node-exporter | `node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes` |
| Disk usage | node-exporter | `node_filesystem_avail_bytes / node_filesystem_size_bytes` |

## Alert rules (monitoring/prometheus/alerts.yml)

| Alert | Condition | Severity |
|---|---|---|
| ContainerDown | not seen for 60s | critical |
| ContainerHighCpu | > 85% for 10m | warning |
| ContainerHighMemory | > 90% of limit for 10m | warning |
| HostHighCpu | > 85% for 10m | warning |
| HostLowMemory | < 10% available for 5m | critical |
| HostDiskSpaceLow | < 15% free for 5m | critical |
| ScrapeTargetDown | `up == 0` for 2m | warning |

## Running the health check

```bash
./scripts/health_check.sh
```

Output sections: 1. container status, 2. CPU/memory (`docker stats`), 3. disk (host, docker, volumes), 4. endpoints through the proxy, 5. database, 6. backups. Exit code 0 = HEALTHY, 1 = DEGRADED.

## Troubleshooting

| Symptom | Action |
|---|---|
| jira `health: starting` > 10 min | `docker compose logs jira`, check JVM memory in `.env` |
| 503 "starting up" from proxy | upstream still booting — wait |
| backup unhealthy | `docker compose logs backup`; run `./scripts/backup_database.sh` |
| cAdvisor fails on macOS | expected on Docker Desktop for some mounts; remove `/dev/kmsg` device |
