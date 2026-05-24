#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT_DIR"

echo "[compose-destroy] Stopping containers and deleting MySQL data volume..."
docker compose down -v --remove-orphans

echo "[compose-destroy] Done. Database data has been fully removed."
