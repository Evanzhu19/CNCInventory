import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { InventoryBucket, ItemTrackingMode, RecoveryStatus } from "../generated/prisma/enums.js";
import { toNumber } from "./serialize.js";

type Tx = Prisma.TransactionClient;

export async function ensureInventory(tx: Tx, itemId: bigint, warehouseId: bigint) {
  return tx.inventory.upsert({
    where: {
      itemId_warehouseId: {
        itemId,
        warehouseId,
      },
    },
    create: {
      itemId,
      warehouseId,
      availableQty: 0,
      borrowedQty: 0,
      pendingQty: 0,
    },
    update: {},
  });
}

export async function applyStockIn(tx: Tx, itemId: bigint, warehouseId: bigint, qty: number) {
  await ensureInventory(tx, itemId, warehouseId);
  await tx.inventory.update({
    where: { itemId_warehouseId: { itemId, warehouseId } },
    data: { availableQty: { increment: qty } },
  });
}

export async function applyStockOut(
  tx: Tx,
  itemId: bigint,
  warehouseId: bigint,
  qty: number,
  trackingMode: ItemTrackingMode,
) {
  const inventory = await ensureInventory(tx, itemId, warehouseId);
  if (toNumber(inventory.availableQty) < qty) {
    throw new Error("可用库存不足，不能出库");
  }

  await tx.inventory.update({
    where: { itemId_warehouseId: { itemId, warehouseId } },
    data: {
      availableQty: { decrement: qty },
      borrowedQty: trackingMode === ItemTrackingMode.CLOSED_LOOP ? { increment: qty } : undefined,
      pendingQty: trackingMode === ItemTrackingMode.REPAIR_PENDING ? { increment: qty } : undefined,
    },
  });
}

export async function applyRecovery(
  tx: Tx,
  itemId: bigint,
  warehouseId: bigint,
  qty: number,
  recoveryStatus: RecoveryStatus,
) {
  const inventory = await ensureInventory(tx, itemId, warehouseId);
  if (toNumber(inventory.borrowedQty) < qty) {
    throw new Error("在外数量不足，不能回收");
  }

  const returnsToAvailable =
    recoveryStatus === RecoveryStatus.REUSABLE || recoveryStatus === RecoveryStatus.ROUGHING_REUSABLE;
  const goesToPending =
    recoveryStatus === RecoveryStatus.PENDING_INSPECTION || recoveryStatus === RecoveryStatus.REPAIRABLE;

  await tx.inventory.update({
    where: { itemId_warehouseId: { itemId, warehouseId } },
    data: {
      borrowedQty: { decrement: qty },
      availableQty: returnsToAvailable ? { increment: qty } : undefined,
      pendingQty: goesToPending ? { increment: qty } : undefined,
    },
  });
}

export async function applyLoss(tx: Tx, itemId: bigint, warehouseId: bigint, qty: number, sourceBucket: InventoryBucket) {
  const inventory = await ensureInventory(tx, itemId, warehouseId);

  const currentQty =
    sourceBucket === InventoryBucket.AVAILABLE
      ? toNumber(inventory.availableQty)
      : sourceBucket === InventoryBucket.BORROWED
        ? toNumber(inventory.borrowedQty)
        : toNumber(inventory.pendingQty);

  if (currentQty < qty) {
    throw new Error("损耗数量超过当前可扣减数量");
  }

  await tx.inventory.update({
    where: { itemId_warehouseId: { itemId, warehouseId } },
    data: {
      availableQty: sourceBucket === InventoryBucket.AVAILABLE ? { decrement: qty } : undefined,
      borrowedQty: sourceBucket === InventoryBucket.BORROWED ? { decrement: qty } : undefined,
      pendingQty: sourceBucket === InventoryBucket.PENDING ? { decrement: qty } : undefined,
    },
  });
}

export async function writeOperationLog(
  tx: Tx,
  userId: bigint | undefined,
  module: string,
  action: string,
  targetTable: string,
  targetId: bigint | undefined,
  detail: Prisma.InputJsonValue,
) {
  await tx.operationLog.create({
    data: {
      userId,
      module,
      action,
      targetTable,
      targetId,
      detail,
    },
  });
}

export type AppPrismaClient = PrismaClient;
