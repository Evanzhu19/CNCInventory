#!/bin/bash
# ========================================================================
# update.sh — 将本地改动同步到CT并重建
#
# 用法:
#   ./update.sh           普通更新（代码 + 自动应用数据库 migration）
#   ./update.sh --reset   清空CT数据库并重新初始化（危险！不可逆！）
# ========================================================================
set -euo pipefail

CT_USER="root"
CT_HOST="192.168.101.241"
CT_PATH="/root/mills-inventory-sys"
RESET=false

for arg in "$@"; do
  case "$arg" in
    --reset) RESET=true ;;
    *)
      echo "未知参数: $arg"
      echo "用法: $0 [--reset]"
      exit 1
      ;;
  esac
done

# ── 1. 同步项目文件到CT ────────────────────────────────────
echo "[1/4] rsync 同步项目文件到 ${CT_HOST}..."
rsync -az --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='*/node_modules' \
  --exclude='dist' \
  --exclude='*/dist' \
  --exclude='.env' \
  --exclude='*.log' \
  --exclude='playwright-report' \
  --exclude='test-results' \
  --exclude='CNCInventory' \
  --exclude='tmp-*' \
  ./ "${CT_USER}@${CT_HOST}:${CT_PATH}/"

# ── 2. --reset 模式：清空数据库重新初始化 ─────────────────
if [[ "$RESET" == true ]]; then
  echo ""
  echo "⚠️  警告：即将清空CT上的所有数据！此操作不可逆！"
  read -r -p "确认请输入 YES: " confirm
  if [[ "$confirm" != "YES" ]]; then
    echo "已取消。"
    exit 1
  fi
  echo "[2/4] 停止服务并删除数据库卷..."
  ssh "${CT_USER}@${CT_HOST}" "cd ${CT_PATH} && docker compose down -v"
  echo "[3/4] 重新构建镜像并全量初始化（含seed）..."
  ssh "${CT_USER}@${CT_HOST}" "cd ${CT_PATH} && docker compose up -d --build"
  echo "[4/4] 等待服务就绪..."
  sleep 10
  ssh "${CT_USER}@${CT_HOST}" "cd ${CT_PATH} && docker compose ps"
  echo ""
  echo "✓ 重置完成"
  exit 0
fi

# ── 3. 普通更新：先构建镜像，再跑migration，再重启 ─────────
# 必须先 build 再 run db-init，确保 migration 使用新 schema
echo "[2/4] 构建 Docker 镜像（db-init / backend / frontend）..."
ssh "${CT_USER}@${CT_HOST}" "cd ${CT_PATH} && docker compose build db-init backend frontend"

echo "[3/4] 运行数据库 migration（跳过seed）..."
ssh "${CT_USER}@${CT_HOST}" "cd ${CT_PATH} && SKIP_SEED=1 docker compose run --rm db-init"

echo "[4/4] 重启后端和前端..."
ssh "${CT_USER}@${CT_HOST}" "cd ${CT_PATH} && docker compose up -d --no-deps backend frontend"
ssh "${CT_USER}@${CT_HOST}" "cd ${CT_PATH} && docker compose ps"

echo ""
echo "✓ 更新完成"
