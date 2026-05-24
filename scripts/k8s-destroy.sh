#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT_DIR"

echo "[k8s-destroy] Deleting namespace mills-inventory ..."
kubectl delete namespace mills-inventory --ignore-not-found=true

echo "[k8s-destroy] Done."
