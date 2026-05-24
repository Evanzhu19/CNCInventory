#!/usr/bin/env bash
# ========================================================================
# CLEANUP.SH - Unified Cleanup Script
# ========================================================================
# Default mode is Docker Compose.
# Optional mode: Kubernetes namespace cleanup.
# ========================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODE="compose"
CLEAN_IMAGES=false
FORCE_CLEANUP=false

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

print_help() {
  echo "Usage: $0 [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  --compose     Cleanup Docker Compose stack (default)"
  echo "  --k8s         Cleanup Kubernetes namespace"
  echo "  --images      Also remove application Docker images"
  echo "  --force       Skip confirmation prompt"
  echo "  -h, --help    Show this help message"
  echo ""
  echo "Examples:"
  echo "  $0"
  echo "  $0 --force"
  echo "  $0 --images --force"
  echo "  $0 --k8s --force"
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
    --images)
      CLEAN_IMAGES=true
      shift
      ;;
    --force)
      FORCE_CLEANUP=true
      shift
      ;;
    -h|--help)
      print_help
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      print_help
      exit 1
      ;;
  esac
done

cd "$ROOT_DIR"

echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║                      CLEANUP SCRIPT                         ║${NC}"
echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [[ "$FORCE_CLEANUP" == false ]]; then
  echo -e "${YELLOW}⚠ WARNING: This will remove the following:${NC}"
  if [[ "$MODE" == "compose" ]]; then
    echo "   • Docker Compose containers"
    echo "   • Docker Compose network"
    echo "   • MySQL volume data"
    echo "   • Current database contents"
  else
    echo "   • Kubernetes namespace: mills-inventory"
    echo "   • All resources inside that namespace"
  fi

  if [[ "$CLEAN_IMAGES" == true ]]; then
    echo "   • Application Docker images"
  fi

  echo ""
  read -r -p "Are you sure you want to continue? [y/N] " reply
  if [[ ! "$reply" =~ ^[Yy]$ ]]; then
    echo -e "${CYAN}Cleanup cancelled.${NC}"
    exit 0
  fi
  echo ""
fi

if [[ "$MODE" == "compose" ]]; then
  echo -e "${YELLOW}[1/3]${NC} Stopping Compose stack and deleting database volume..."
  docker compose down -v --remove-orphans
  echo -e "${GREEN}✓ Compose stack removed${NC}"

  echo ""
  echo -e "${YELLOW}[2/3]${NC} Cleaning images..."
  if [[ "$CLEAN_IMAGES" == true ]]; then
    for image in mills-inventory-sys-backend mills-inventory-sys-frontend mills-inventory-sys-db-init; do
      if docker image inspect "$image" >/dev/null 2>&1; then
        docker rmi -f "$image" >/dev/null 2>&1 || true
        echo -e "${GREEN}  ✓ Removed image: $image${NC}"
      else
        echo -e "${CYAN}  → Image not found: $image${NC}"
      fi
    done
    docker image prune -f >/dev/null 2>&1 || true
    echo -e "${GREEN}✓ Application images cleaned${NC}"
  else
    echo -e "${CYAN}  → Skipping image cleanup${NC}"
  fi

  echo ""
  echo -e "${YELLOW}[3/3]${NC} Verification"
  docker compose ps || true
  echo ""
  echo -e "${GREEN}✅ Cleanup complete. Database is now empty.${NC}"
  exit 0
fi

echo -e "${YELLOW}[1/3]${NC} Checking Kubernetes access..."
if ! command -v kubectl >/dev/null 2>&1; then
  echo -e "${RED}✗ Missing: kubectl${NC}"
  exit 1
fi
echo -e "${GREEN}✓ kubectl found${NC}"

echo ""
echo -e "${YELLOW}[2/3]${NC} Deleting namespace..."
kubectl delete namespace mills-inventory --ignore-not-found=true
echo -e "${GREEN}✓ Namespace deletion submitted${NC}"

echo ""
echo -e "${YELLOW}[3/3]${NC} Cleanup summary"
if [[ "$CLEAN_IMAGES" == true ]]; then
  echo -e "${CYAN}  → Image cleanup is not handled in k8s mode.${NC}"
fi
echo -e "${GREEN}✅ Kubernetes cleanup complete.${NC}"
