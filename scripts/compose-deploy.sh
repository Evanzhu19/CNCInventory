#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT_DIR"

wait_for_url() {
  local name="$1"
  local url="$2"

  echo "[compose-deploy] Waiting for ${name}..."
  for _ in {1..60}; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done

  echo "[compose-deploy] ${name} did not become ready in time."
  docker compose ps
  exit 1
}

echo "[compose-deploy] Starting stack..."
docker compose up --build -d

wait_for_url "backend" "http://localhost:4000/api/health"
wait_for_url "frontend" "http://localhost:5173/"

echo "[compose-deploy] Stack status:"
docker compose ps

echo "[compose-deploy] Done."
echo "Frontend: http://localhost:5173"
echo "Backend:  http://localhost:4000/api/health"
echo "Adminer:  http://localhost:8080"
