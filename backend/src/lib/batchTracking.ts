import type { Prisma } from "../generated/prisma/client.js";
import { InventoryBucket, ItemTrackingMode, RecoveryStatus, StockInType } from "../generated/prisma/enums.js";
import { toNumber } from "./serialize.js";

type Tx = Prisma.TransactionClient;

type BatchBalanceField = "availableQtyBalance" | "borrowedQtyBalance" | "pendingQtyBalance";

type BatchAllocation = {
  stockInItemId: bigint;
  qty: number;
};

function batchBalanceField(bucket: InventoryBucket): BatchBalanceField {
  switch (bucket) {
    case InventoryBucket.BORROWED:
      return "borrowedQtyBalance";
    case InventoryBucket.PENDING:
      return "pendingQtyBalance";
    case InventoryBucket.AVAILABLE:
    default:
      return "availableQtyBalance";
  }
}

function bucketUpdate(bucket: InventoryBucket, operation: "increment" | "decrement", qty: number) {
  const field = batchBalanceField(bucket);
  return {
    [field]: { [operation]: qty },
  } satisfies Partial<Record<BatchBalanceField, { increment?: number; decrement?: number }>>;
}

async function allocateFromBatchBucket(tx: Tx, itemId: bigint, qty: number, bucket: InventoryBucket) {
  const field = batchBalanceField(bucket);
  const batches = await tx.stockInItem.findMany({
    where: {
      itemId,
      [field]: {
        gt: 0,
      },
    },
    select: {
      id: true,
      availableQtyBalance: true,
      borrowedQtyBalance: true,
      pendingQtyBalance: true,
      stockIn: {
        select: {
          inTime: true,
        },
      },
    },
    orderBy: [{ stockIn: { inTime: "asc" } }, { id: "asc" }],
  });

  let remaining = qty;
  const allocations: BatchAllocation[] = [];

  for (const batch of batches) {
    if (remaining <= 0) {
      break;
    }

    const currentBalance =
      field === "availableQtyBalance"
        ? toNumber(batch.availableQtyBalance)
        : field === "borrowedQtyBalance"
          ? toNumber(batch.borrowedQtyBalance)
          : toNumber(batch.pendingQtyBalance);

    const allocatedQty = Math.min(remaining, currentBalance);
    if (allocatedQty <= 0) {
      continue;
    }

    allocations.push({
      stockInItemId: batch.id,
      qty: allocatedQty,
    });
    remaining -= allocatedQty;
  }

  if (remaining > 0) {
    throw new Error("批次库存不足，无法完成本次操作");
  }

  return allocations;
}

function adjustmentInNo(itemId: bigint) {
  return `ADJ-IN-${itemId.toString()}-${Date.now()}`;
}

export async function initializeStockInItemBatchBalance(tx: Tx, stockInItemId: bigint, qty: number) {
  await tx.stockInItem.update({
    where: { id: stockInItemId },
    data: {
      availableQtyBalance: qty,
      borrowedQtyBalance: 0,
      pendingQtyBalance: 0,
    },
  });
}

export async function applyStockOutBatchTracking(
  tx: Tx,
  stockOutItemId: bigint,
  itemId: bigint,
  qty: number,
  trackingMode: ItemTrackingMode,
) {
  const allocations = await allocateFromBatchBucket(tx, itemId, qty, InventoryBucket.AVAILABLE);

  for (const allocation of allocations) {
    await tx.stockInItem.update({
      where: { id: allocation.stockInItemId },
      data: {
        ...bucketUpdate(InventoryBucket.AVAILABLE, "decrement", allocation.qty),
        ...(trackingMode === ItemTrackingMode.CLOSED_LOOP
          ? bucketUpdate(InventoryBucket.BORROWED, "increment", allocation.qty)
          : {}),
      },
    });

    await tx.stockOutItemBatchAllocation.create({
      data: {
        stockOutItemId,
        stockInItemId: allocation.stockInItemId,
        qty: allocation.qty,
      },
    });
  }
}

export async function applyRecoveryBatchTracking(
  tx: Tx,
  recoveryRecordId: bigint,
  itemId: bigint,
  qty: number,
  recoveryStatus: RecoveryStatus,
) {
  const allocations = await allocateFromBatchBucket(tx, itemId, qty, InventoryBucket.BORROWED);
  const targetBucket =
    recoveryStatus === RecoveryStatus.REUSABLE || recoveryStatus === RecoveryStatus.ROUGHING_REUSABLE
      ? InventoryBucket.AVAILABLE
      : recoveryStatus === RecoveryStatus.PENDING_INSPECTION || recoveryStatus === RecoveryStatus.REPAIRABLE
        ? InventoryBucket.PENDING
        : null;

  for (const allocation of allocations) {
    await tx.stockInItem.update({
      where: { id: allocation.stockInItemId },
      data: {
        ...bucketUpdate(InventoryBucket.BORROWED, "decrement", allocation.qty),
        ...(targetBucket ? bucketUpdate(targetBucket, "increment", allocation.qty) : {}),
      },
    });

    await tx.recoveryBatchAllocation.create({
      data: {
        recoveryRecordId,
        stockInItemId: allocation.stockInItemId,
        qty: allocation.qty,
      },
    });
  }
}

export async function applyLossBatchTracking(
  tx: Tx,
  lossRecordId: bigint,
  itemId: bigint,
  qty: number,
  sourceBucket: InventoryBucket,
) {
  const allocations = await allocateFromBatchBucket(tx, itemId, qty, sourceBucket);

  for (const allocation of allocations) {
    await tx.stockInItem.update({
      where: { id: allocation.stockInItemId },
      data: {
        ...bucketUpdate(sourceBucket, "decrement", allocation.qty),
      },
    });

    await tx.lossBatchAllocation.create({
      data: {
        lossRecordId,
        stockInItemId: allocation.stockInItemId,
        qty: allocation.qty,
      },
    });
  }
}

export async function applyManualInventoryAdjustmentBatchTracking(params: {
  tx: Tx;
  itemId: bigint;
  warehouseId: bigint;
  operatorId: bigint;
  reason: string;
  before: {
    availableQty: number;
    borrowedQty: number;
    pendingQty: number;
  };
  after: {
    availableQty: number;
    borrowedQty: number;
    pendingQty: number;
  };
}) {
  const { tx, itemId, warehouseId, operatorId, reason, before, after } = params;

  const deltas = {
    available: after.availableQty - before.availableQty,
    borrowed: after.borrowedQty - before.borrowedQty,
    pending: after.pendingQty - before.pendingQty,
  };

  if (deltas.available < 0) {
    const allocations = await allocateFromBatchBucket(tx, itemId, Math.abs(deltas.available), InventoryBucket.AVAILABLE);
    for (const allocation of allocations) {
      await tx.stockInItem.update({
        where: { id: allocation.stockInItemId },
        data: {
          ...bucketUpdate(InventoryBucket.AVAILABLE, "decrement", allocation.qty),
        },
      });
    }
  }

  if (deltas.borrowed < 0) {
    const allocations = await allocateFromBatchBucket(tx, itemId, Math.abs(deltas.borrowed), InventoryBucket.BORROWED);
    for (const allocation of allocations) {
      await tx.stockInItem.update({
        where: { id: allocation.stockInItemId },
        data: {
          ...bucketUpdate(InventoryBucket.BORROWED, "decrement", allocation.qty),
        },
      });
    }
  }

  if (deltas.pending < 0) {
    const allocations = await allocateFromBatchBucket(tx, itemId, Math.abs(deltas.pending), InventoryBucket.PENDING);
    for (const allocation of allocations) {
      await tx.stockInItem.update({
        where: { id: allocation.stockInItemId },
        data: {
          ...bucketUpdate(InventoryBucket.PENDING, "decrement", allocation.qty),
        },
      });
    }
  }

  const positiveAvailable = Math.max(deltas.available, 0);
  const positiveBorrowed = Math.max(deltas.borrowed, 0);
  const positivePending = Math.max(deltas.pending, 0);
  const positiveTotal = positiveAvailable + positiveBorrowed + positivePending;

  if (positiveTotal <= 0) {
    return;
  }

  await tx.stockIn.create({
    data: {
      inNo: adjustmentInNo(itemId),
      inType: StockInType.ADJUSTMENT,
      warehouseId,
      operatorId,
      inTime: new Date(),
      totalAmount: 0,
      remark: `库存手动调整补差: ${reason}`,
      items: {
        create: {
          itemId,
          qty: positiveTotal,
          availableQtyBalance: positiveAvailable,
          borrowedQtyBalance: positiveBorrowed,
          pendingQtyBalance: positivePending,
          unitPrice: 0,
          totalPrice: 0,
          remark: `库存手动调整补差: ${reason}`,
        },
      },
    },
  });
}
