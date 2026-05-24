#!/usr/bin/env bash
# ========================================================================
# FRESH-START.SH - Full Reset And Redeploy
# ========================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODE="compose"
EMPTY_DEPLOY=false
CLEAN_IMAGES=false

print_help() {
  echo "Usage: $0 [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  --compose     Reset and redeploy Compose stack (default)"
  echo "  --k8s         Reset and redeploy Kubernetes namespace"
  echo "  --empty       Compose only: redeploy without seed data"
  echo "  --images      Also remove application Docker images during cleanup"
  echo "  -h, --help    Show this help message"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --compose)
      MODE="compose"
      shift
      ;;
    --k8s)
      MODE="k8s"
      shift
      ;;
    --empty)
      EMPTY_DEPLOY=true
      shift
      ;;
    --images)
      CLEAN_IMAGES=true
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

cd "$ROOT_DIR"

if [[ "$MODE" == "compose" ]]; then
  if [[ "$CLEAN_IMAGES" == true ]]; then
    ./cleanup.sh --compose --images --force
  else
    ./cleanup.sh --compose --force
  fi

  if [[ "$EMPTY_DEPLOY" == true ]]; then
    ./full-deploy.sh --compose --empty
  else
    ./full-deploy.sh --compose
  fi

  exit 0
fi

if [[ "$CLEAN_IMAGES" == true ]]; then
  ./cleanup.sh --k8s --images --force
else
  ./cleanup.sh --k8s --force
fi
./full-deploy.sh --k8s
