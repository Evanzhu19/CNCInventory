#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="${ROOT_DIR}/migration-bundles"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
BUNDLE_NAME="mills-inventory-migration-${TIMESTAMP}"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "${TMP_DIR}"
}

trap cleanup EXIT

print_help() {
  echo "Usage: $0 [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  --output-dir DIR   Directory to place the final bundle"
  echo "  -h, --help         Show this help message"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir)
      OUTPUT_DIR="$2"
      shift 2
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

if [[ ! -f "${ROOT_DIR}/.env" ]]; then
  echo "Root .env not found. Copy .env.example to .env and fill it first."
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "${ROOT_DIR}/.env"
set +a

require_var() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "${value}" ]]; then
    echo "${name} is required in .env"
    exit 1
  fi
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

require_var "MYSQL_ROOT_PASSWORD"
require_var "MYSQL_DATABASE"
require_var "MYSQL_USER"
require_var "MYSQL_PASSWORD"
require_var "JWT_SECRET"
require_var "APP_PUBLIC_URL"

mkdir -p "${OUTPUT_DIR}"

cd "${ROOT_DIR}"

echo "Starting mysql service if needed..."
docker compose up -d mysql
wait_for_mysql

echo "Exporting database dump..."
docker compose exec -T mysql sh -c \
  'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --quick --routines --events --triggers --default-character-set=utf8mb4 --hex-blob --set-gtid-purged=OFF --no-tablespaces "$MYSQL_DATABASE"' \
  | gzip > "${TMP_DIR}/database.sql.gz"

echo "Copying deployment environment..."
cp "${ROOT_DIR}/.env" "${TMP_DIR}/.env"

cat > "${TMP_DIR}/manifest.txt" <<EOF
bundle_name=${BUNDLE_NAME}
created_at=${TIMESTAMP}
app_public_url=${APP_PUBLIC_URL}
mysql_database=${MYSQL_DATABASE}
mysql_user=${MYSQL_USER}
EOF

cat > "${TMP_DIR}/RESTORE_NOTES.txt" <<'EOF'
1. Copy this bundle to the target CT/server.
2. Extract the bundle:
   tar -xzf mills-inventory-migration-*.tar.gz
3. Run the included restore script:
   ./restore-migration-bundle.sh mills-inventory-migration-*.tar.gz --target-dir /opt/mills-inventory --force
EOF

cp "${ROOT_DIR}/scripts/restore-migration-bundle.sh" "${TMP_DIR}/restore-migration-bundle.sh"

echo "Packing clean application source..."
tar \
  --exclude="./node_modules" \
  --exclude="./backend/node_modules" \
  --exclude="./frontend/node_modules" \
  --exclude="./backend/dist" \
  --exclude="./frontend/dist" \
  --exclude="./playwright-report" \
  --exclude="./test-results" \
  --exclude="./migration-bundles" \
  --exclude="./tmp-e2e-login-debug.png" \
  --exclude="./.DS_Store" \
  -czf "${TMP_DIR}/app-source.tar.gz" \
  .

echo "Creating final migration bundle..."
tar -czf "${OUTPUT_DIR}/${BUNDLE_NAME}.tar.gz" -C "${TMP_DIR}" app-source.tar.gz database.sql.gz .env manifest.txt RESTORE_NOTES.txt restore-migration-bundle.sh

echo ""
echo "Bundle created:"
echo "${OUTPUT_DIR}/${BUNDLE_NAME}.tar.gz"
