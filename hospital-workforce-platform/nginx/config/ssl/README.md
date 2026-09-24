# SSL certificates (not committed)

Place certificates here — this folder is git-ignored except for this README.

Local development (self-signed):

```bash
./scripts/generate_dev_certs.sh        # creates jira.local / confluence.local certs
```

Then:
1. Uncomment the `listen 443` server blocks in `nginx/config/conf.d/10-jira.conf` and `20-confluence.conf`.
2. Uncomment `Strict-Transport-Security` in `nginx/config/snippets/security-headers.conf`.
3. Set `PUBLIC_SCHEME=https`, `PUBLIC_HTTP_PORT=443`, `PUBLIC_SECURE=true` in `.env`.
4. `docker compose up -d --force-recreate nginx jira confluence`
