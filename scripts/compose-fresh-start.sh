#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

"$ROOT_DIR/scripts/compose-destroy.sh"

if [[ "${1:-}" == "--empty" ]]; then
  echo "[compose-fresh-start] Starting with an empty database and without seed..."
  SKIP_SEED=1 "$ROOT_DIR/scripts/compose-deploy.sh"
  exit 0
fi

"$ROOT_DIR/scripts/compose-deploy.sh"
