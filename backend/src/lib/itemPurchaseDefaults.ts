import type { Prisma } from "../generated/prisma/client.js";
import { StockInType } from "../generated/prisma/enums.js";

type Tx = Prisma.TransactionClient;

function uniqueItemIds(itemIds: bigint[]) {
  return Array.from(new Map(itemIds.map((itemId) => [itemId.toString(), itemId])).values());
}

export async function syncLatestPurchasePriceForItems(tx: Tx, itemIds: bigint[]) {
  for (const itemId of uniqueItemIds(itemIds)) {
    const latestPurchase = await tx.stockInItem.findFirst({
      where: {
        itemId,
        unitPrice: { gt: 0 },
        stockIn: {
          inType: StockInType.PURCHASE,
        },
      },
      select: {
        unitPrice: true,
      },
      orderBy: [{ stockIn: { inTime: "desc" } }, { id: "desc" }],
    });

    await tx.item.update({
      where: { id: itemId },
      data: {
        defaultPrice: latestPurchase?.unitPrice ?? null,
      },
    });
  }
}
