#!/usr/bin/env bash
# HWDT — self-signed certificates for local HTTPS (jira.local, confluence.local, monitoring.local)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSL_DIR="${ROOT}/nginx/config/ssl"
mkdir -p "$SSL_DIR"
for host in jira.local confluence.local monitoring.local; do
  openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
    -keyout "${SSL_DIR}/${host}.key" -out "${SSL_DIR}/${host}.crt" \
    -subj "/CN=${host}/O=HWDT Local Dev" \
    -addext "subjectAltName=DNS:${host}" 2>/dev/null
  chmod 600 "${SSL_DIR}/${host}.key"
  echo "Created ${SSL_DIR}/${host}.crt"
done
