#!/usr/bin/env bash
# HWDT — create .env from .env.example with random strong secrets.
# Usage: ./scripts/generate_env.sh [--force]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -f "${ROOT}/.env" && "${1:-}" != "--force" ]]; then
  echo ".env already exists (use --force to regenerate)"; exit 0
fi
gen() { LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 32; }
cp "${ROOT}/.env.example" "${ROOT}/.env"
while grep -q 'change_me_[a-z_]*' "${ROOT}/.env"; do
  placeholder="$(grep -o 'change_me_[a-z_]*' "${ROOT}/.env" | head -n1)"
  sed -i.bak "s/${placeholder}/$(gen)/" "${ROOT}/.env"
done
rm -f "${ROOT}/.env.bak"
chmod 600 "${ROOT}/.env"
echo "Generated ${ROOT}/.env with random secrets (mode 600)."
