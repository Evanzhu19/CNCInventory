#!/bin/bash
set -e

CT_USER="root"
CT_HOST="192.168.101.241"
CT_PATH="/root/mills-inventory-sys"   # ← 确认这是CT里项目的实际路径

echo "[1/3] 同步前端源码..."
scp -r frontend/src "${CT_USER}@${CT_HOST}:${CT_PATH}/frontend/"

echo "[2/3] 同步后端源码..."
scp -r backend/src "${CT_USER}@${CT_HOST}:${CT_PATH}/backend/"

echo "[3/3] 重建并重启前后端（MySQL 不受影响）..."
ssh "${CT_USER}@${CT_HOST}" "cd ${CT_PATH} && docker compose up -d --no-deps --build backend frontend"

echo "✓ 更新完成"
