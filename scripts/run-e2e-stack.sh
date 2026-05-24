#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  if [ -n "${BACKEND_PID}" ]; then
    kill "${BACKEND_PID}" 2>/dev/null || true
  fi

  if [ -n "${FRONTEND_PID}" ]; then
    kill "${FRONTEND_PID}" 2>/dev/null || true
  fi

  wait 2>/dev/null || true
}

trap cleanup EXIT INT TERM

docker compose up -d mysql

DATABASE_URL="${DATABASE_URL:-mysql://tooling_user:tooling_password@127.0.0.1:3306/tooling_inventory_e2e_test}" \
E2E_DATABASE_NAME="${E2E_DATABASE_NAME:-tooling_inventory_e2e_test}" \
E2E_DB_ROOT_USER="${E2E_DB_ROOT_USER:-root}" \
E2E_DB_ROOT_PASSWORD="${E2E_DB_ROOT_PASSWORD:-root_password}" \
E2E_DB_ROOT_HOST="${E2E_DB_ROOT_HOST:-127.0.0.1}" \
E2E_DB_ROOT_PORT="${E2E_DB_ROOT_PORT:-3306}" \
INITIAL_ADMIN_USERNAME="${INITIAL_ADMIN_USERNAME:-admin_e2e}" \
INITIAL_ADMIN_PASSWORD="${INITIAL_ADMIN_PASSWORD:-AdminE2E#123}" \
INITIAL_ADMIN_REAL_NAME="${INITIAL_ADMIN_REAL_NAME:-E2E管理员}" \
BCRYPT_SALT_ROUNDS="${BCRYPT_SALT_ROUNDS:-4}" \
npm --prefix backend run e2e:prepare

HOST="${HOST:-127.0.0.1}" \
PORT="${PORT:-4100}" \
CORS_ORIGIN="${CORS_ORIGIN:-http://127.0.0.1:4173}" \
DATABASE_URL="${DATABASE_URL:-mysql://tooling_user:tooling_password@127.0.0.1:3306/tooling_inventory_e2e_test}" \
JWT_SECRET="${JWT_SECRET:-e2e-test-super-secret-1234567890}" \
BCRYPT_SALT_ROUNDS="${BCRYPT_SALT_ROUNDS:-4}" \
npm --prefix backend run e2e:server &
BACKEND_PID=$!

for _ in $(seq 1 60); do
  if curl -sf "http://${HOST:-127.0.0.1}:${PORT:-4100}/api/health" >/dev/null; then
    break
  fi
  sleep 1
done

VITE_PORT="${VITE_PORT:-4173}" \
VITE_API_PROXY_TARGET="${VITE_API_PROXY_TARGET:-http://127.0.0.1:4100}" \
VITE_API_BASE_URL="${VITE_API_BASE_URL:-/api}" \
npm --prefix frontend run e2e:dev &
FRONTEND_PID=$!

for _ in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:${VITE_PORT:-4173}/" >/dev/null; then
    break
  fi
  sleep 1
done

while true; do
  if ! kill -0 "${BACKEND_PID}" 2>/dev/null; then
    wait "${BACKEND_PID}"
    exit $?
  fi

  if ! kill -0 "${FRONTEND_PID}" 2>/dev/null; then
    wait "${FRONTEND_PID}"
    exit $?
  fi

  sleep 1
done
