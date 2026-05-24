#!/usr/bin/env bash

set -euo pipefail

BUNDLE_PATH=""
TARGET_DIR=""
WITH_ADMINER=false
FORCE_RESTORE=false
TMP_DIR="$(mktemp -d)"
HTTP_CLIENT=""

cleanup() {
  rm -rf "${TMP_DIR}"
}

trap cleanup EXIT

print_help() {
  echo "Usage: $0 BUNDLE_PATH [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  --target-dir DIR   Directory to restore into"
  echo "  --with-adminer     Start Adminer profile after restore"
  echo "  --force            Overwrite existing target .env and run compose down -v before restore"
  echo "  -h, --help         Show this help message"
}

if [[ $# -lt 1 ]]; then
  print_help
  exit 1
fi

BUNDLE_PATH="$1"
shift

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target-dir)
      TARGET_DIR="$2"
      shift 2
      ;;
    --with-adminer)
      WITH_ADMINER=true
      shift
      ;;
    --force)
      FORCE_RESTORE=true
      shift
      ;;
    -h|--help)
      print_help
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      print_help
      exit 1
      ;;
  esac
done

if [[ ! -f "${BUNDLE_PATH}" ]]; then
  echo "Bundle not found: ${BUNDLE_PATH}"
  exit 1
fi

if [[ -z "${TARGET_DIR}" ]]; then
  TARGET_DIR="$(pwd)/mills-inventory-restored"
fi

detect_http_client() {
  if command -v curl >/dev/null 2>&1; then
    HTTP_CLIENT="curl"
    return 0
  fi

  if command -v wget >/dev/null 2>&1; then
    HTTP_CLIENT="wget"
    return 0
  fi

  echo "Missing HTTP client: install curl or wget."
  exit 1
}

http_probe() {
  local url="$1"

  if [[ "${HTTP_CLIENT}" == "curl" ]]; then
    curl -fsS "${url}" >/dev/null 2>&1
    return $?
  fi

  wget -q -O /dev/null "${url}" >/dev/null 2>&1
}

wait_for_mysql() {
  for _ in $(seq 1 60); do
    if docker compose exec -T mysql sh -c 'mysqladmin ping -h 127.0.0.1 -uroot -p"$MYSQL_ROOT_PASSWORD" --silent' >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done

  echo "MySQL did not become ready in time."
  exit 1
}

wait_for_frontend() {
  local frontend_port="$1"
  for _ in $(seq 1 60); do
    if http_probe "http://127.0.0.1:${frontend_port}/"; then
      return 0
    fi
    sleep 2
  done

  echo "Frontend did not become ready in time."
  exit 1
}

detect_http_client

mkdir -p "${TARGET_DIR}"

echo "Extracting bundle..."
tar -xzf "${BUNDLE_PATH}" -C "${TMP_DIR}"

if [[ -f "${TARGET_DIR}/docker-compose.yml" && "${FORCE_RESTORE}" != true ]]; then
  echo "Target directory already looks like a deployment."
  echo "Use --force if you want this script to overwrite .env and reset containers."
  exit 1
fi

if [[ "${FORCE_RESTORE}" == true && -f "${TARGET_DIR}/docker-compose.yml" ]]; then
  echo "Stopping existing stack in target directory..."
  (
    cd "${TARGET_DIR}"
    docker compose down -v --remove-orphans || true
  )
fi

echo "Restoring source files..."
tar -xzf "${TMP_DIR}/app-source.tar.gz" -C "${TARGET_DIR}"

if [[ -f "${TARGET_DIR}/.env" && "${FORCE_RESTORE}" == true ]]; then
  cp "${TARGET_DIR}/.env" "${TARGET_DIR}/.env.before-restore.$(date +"%Y%m%d-%H%M%S").bak"
fi

echo "Restoring deployment .env..."
cp "${TMP_DIR}/.env" "${TARGET_DIR}/.env"

cd "${TARGET_DIR}"

set -a
# shellcheck disable=SC1091
source "${TARGET_DIR}/.env"
set +a

echo "Starting mysql..."
docker compose up -d mysql
wait_for_mysql

echo "Importing database dump..."
gunzip -c "${TMP_DIR}/database.sql.gz" | docker compose exec -T mysql sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"'

echo "Running db-init without seed overwrite..."
compose_profile_args=()
if [[ "${WITH_ADMINER}" == true ]]; then
  compose_profile_args=(--profile tools)
fi

SKIP_SEED=1 docker compose "${compose_profile_args[@]}" up --build -d db-init
docker compose "${compose_profile_args[@]}" up --build -d backend frontend
wait_for_frontend "${FRONTEND_PORT:-80}"

if [[ "${WITH_ADMINER}" == true ]]; then
  docker compose "${compose_profile_args[@]}" up -d adminer
fi

echo ""
echo "Restore completed."
echo "Application URL: ${APP_PUBLIC_URL}"
echo "Target directory: ${TARGET_DIR}"
