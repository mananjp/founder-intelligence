#!/usr/bin/env bash
set -euo pipefail
command -v pnpm >/dev/null || { echo "install pnpm (corepack enable)"; exit 1; }
command -v uv   >/dev/null || { echo "install uv (https://docs.astral.sh/uv)"; exit 1; }
command -v docker >/dev/null || { echo "install docker"; exit 1; }
[ -f .env ] || cp .env.example .env
make bootstrap && make up && sleep 5 && set -a && . ./.env && set +a && make migrate
echo "Ready. Run: make dev"
