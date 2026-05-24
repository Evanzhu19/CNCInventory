#!/usr/bin/env bash
# ========================================================================
# FULL-DEPLOY.SH - Unified Deployment Script
# ========================================================================
# Default mode is Docker Compose.
# Optional mode: Kubernetes manifests.
# ========================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODE="compose"
EMPTY_DEPLOY=false
WITH_ADMINER=false
INITIAL_ADMIN_USERNAME="${INITIAL_ADMIN_USERNAME:-}"
INITIAL_ADMIN_PASSWORD="${INITIAL_ADMIN_PASSWORD:-}"
INITIAL_ADMIN_REAL_NAME="${INITIAL_ADMIN_REAL_NAME:-系统管理员}"
APP_PUBLIC_URL="${APP_PUBLIC_URL:-}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

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
  echo "  --compose     Deploy with Docker Compose (default)"
  echo "  --k8s         Deploy to Kubernetes using deploy/k8s manifests"
  echo "  --empty       Compose only: initialize schema without seed data"
  echo "  --with-adminer  Compose only: also start Adminer debug tool"
  echo "  -h, --help    Show this help message"
  echo ""
  echo "Examples:"
  echo "  $0"
  echo "  $0 --empty"
  echo "  $0 --with-adminer"
  echo "  $0 --k8s"
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
    --with-adminer)
      WITH_ADMINER=true
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

if [[ "$MODE" == "k8s" && "$EMPTY_DEPLOY" == true ]]; then
  echo -e "${RED}--empty is currently only supported in Compose mode.${NC}"
  exit 1
fi

if [[ "$MODE" == "k8s" && -n "$INITIAL_ADMIN_USERNAME" ]]; then
  echo -e "${RED}Bootstrap user options are currently only supported in Compose mode.${NC}"
  exit 1
fi

cd "$ROOT_DIR"

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

APP_PUBLIC_URL="${APP_PUBLIC_URL:-http://localhost:${FRONTEND_PORT:-5173}}"
HTTP_CLIENT=""

ensure_non_empty() {
  local value="$1"
  local message="$2"

  if [[ -z "$value" ]]; then
    echo -e "${RED}${message}${NC}"
    exit 1
  fi
}

detect_http_client() {
  if command -v curl >/dev/null 2>&1; then
    HTTP_CLIENT="curl"
    return 0
  fi

  if command -v wget >/dev/null 2>&1; then
    HTTP_CLIENT="wget"
    return 0
  fi

  echo -e "${RED}Missing HTTP client: install curl or wget.${NC}"
  exit 1
}

http_probe() {
  local url="$1"

  if [[ "$HTTP_CLIENT" == "curl" ]]; then
    curl -fsS "$url" >/dev/null 2>&1
    return $?
  fi

  wget -q -O /dev/null "$url" >/dev/null 2>&1
}

wait_for_url() {
  local name="$1"
  local url="$2"

  echo -e "${CYAN}  → Waiting for ${name}${NC}"
  for _ in {1..60}; do
    if http_probe "$url"; then
      echo -e "${GREEN}  ✓ ${name} ready${NC}"
      return 0
    fi
    sleep 2
  done

  echo -e "${RED}✗ ${name} did not become ready in time${NC}"
  exit 1
}

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                  FULL DEPLOYMENT SCRIPT                     ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${YELLOW}[1/5]${NC} Checking prerequisites..."
MISSING_TOOLS=0

for cmd in docker; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo -e "${RED}✗ Missing: $cmd${NC}"
    MISSING_TOOLS=1
  else
    echo -e "${GREEN}  ✓ $cmd found${NC}"
  fi
done

if command -v curl >/dev/null 2>&1; then
  echo -e "${GREEN}  ✓ curl found${NC}"
elif command -v wget >/dev/null 2>&1; then
  echo -e "${GREEN}  ✓ wget found${NC}"
else
  echo -e "${RED}✗ Missing: curl or wget${NC}"
  MISSING_TOOLS=1
fi

if [[ "$MODE" == "k8s" ]]; then
  for cmd in kubectl; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      echo -e "${RED}✗ Missing: $cmd${NC}"
      MISSING_TOOLS=1
    else
      echo -e "${GREEN}  ✓ $cmd found${NC}"
    fi
  done
fi

if [[ "$MISSING_TOOLS" -eq 1 ]]; then
  echo -e "${RED}Please install missing tools and try again.${NC}"
  exit 1
fi

echo ""
detect_http_client

if [[ "$MODE" == "compose" ]]; then
  if [[ "$EMPTY_DEPLOY" == false ]]; then
    echo -e "${YELLOW}[2/5]${NC} Collecting bootstrap users..."

    if [[ -z "$INITIAL_ADMIN_USERNAME" ]]; then
      read -r -p "Admin username: " INITIAL_ADMIN_USERNAME
    fi

    if [[ -z "$INITIAL_ADMIN_PASSWORD" ]]; then
      read -r -s -p "Admin password: " INITIAL_ADMIN_PASSWORD
      echo ""
    fi

    ensure_non_empty "$INITIAL_ADMIN_USERNAME" "Admin username is required."
    ensure_non_empty "$INITIAL_ADMIN_PASSWORD" "Admin password is required."
  else
    echo -e "${YELLOW}[2/5]${NC} Skipping bootstrap users because --empty was requested..."
  fi

  ensure_non_empty "${MYSQL_ROOT_PASSWORD:-}" "MYSQL_ROOT_PASSWORD is required. Set it in root .env."
  ensure_non_empty "${MYSQL_PASSWORD:-}" "MYSQL_PASSWORD is required. Set it in root .env."
  ensure_non_empty "${JWT_SECRET:-}" "JWT_SECRET is required. Set it in root .env."

  echo -e "${YELLOW}[3/5]${NC} Deploying with Docker Compose..."
  compose_args=(up --build -d)
  if [[ "$WITH_ADMINER" == true ]]; then
    compose_profile_args=(--profile tools)
  else
    compose_profile_args=()
  fi
  if [[ "$EMPTY_DEPLOY" == true ]]; then
    echo -e "${CYAN}  → Empty deploy enabled. Seed data will be skipped.${NC}"
    SKIP_SEED=1 docker compose "${compose_profile_args[@]}" "${compose_args[@]}"
  else
    INITIAL_ADMIN_USERNAME="$INITIAL_ADMIN_USERNAME" \
    INITIAL_ADMIN_PASSWORD="$INITIAL_ADMIN_PASSWORD" \
    INITIAL_ADMIN_REAL_NAME="$INITIAL_ADMIN_REAL_NAME" \
    docker compose "${compose_profile_args[@]}" "${compose_args[@]}"
  fi
  echo -e "${GREEN}✓ Compose deployment submitted${NC}"

  echo ""
  echo -e "${YELLOW}[4/5]${NC} Waiting for services..."
  wait_for_url "frontend" "http://127.0.0.1:${FRONTEND_PORT:-5173}/"

  echo ""
  echo -e "${YELLOW}[5/5]${NC} Deployment summary"
  docker compose "${compose_profile_args[@]}" ps
  echo ""
  echo -e "${GREEN}Frontend:${NC} ${APP_PUBLIC_URL}"
  echo -e "${GREEN}Internal API:${NC} proxied by frontend at /api"
  if [[ "$WITH_ADMINER" == true ]]; then
    echo -e "${GREEN}Adminer:${NC}  http://${ADMINER_BIND_ADDRESS:-127.0.0.1}:${ADMINER_PORT:-8080}/"
  else
    echo -e "${CYAN}Adminer:${NC}  disabled by default. Start with --with-adminer if needed."
  fi
  if [[ "$EMPTY_DEPLOY" == false ]]; then
    echo -e "${GREEN}Admin:${NC} ${INITIAL_ADMIN_USERNAME}"
  fi
  echo ""
  echo -e "${GREEN}✅ Deployment complete.${NC}"
  exit 0
fi

echo -e "${YELLOW}[2/4]${NC} Checking Kubernetes access..."
if ! kubectl cluster-info >/dev/null 2>&1; then
  echo -e "${RED}✗ kubectl cannot reach the current cluster.${NC}"
  echo -e "${YELLOW}Check your kube context before running: kubectl config current-context${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Kubernetes cluster reachable${NC}"

echo ""
echo -e "${YELLOW}[3/4]${NC} Applying manifests..."
kubectl apply -f deploy/k8s
echo -e "${GREEN}✓ Manifests applied${NC}"

echo ""
echo -e "${YELLOW}[4/4]${NC} Current resources"
kubectl get all -n mills-inventory
echo ""
echo -e "${GREEN}✅ Kubernetes deployment submitted.${NC}"
