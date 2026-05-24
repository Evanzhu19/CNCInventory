import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { toBigIntId } from "./serialize.js";

type SupplierResolverClient = Prisma.TransactionClient | PrismaClient;

function normalizeSupplierName(name?: string | null) {
  return name?.trim() ?? "";
}

export async function resolveSupplierId(
  tx: SupplierResolverClient,
  input: {
    supplierId?: string | null;
    supplierName?: string | null;
  },
) {
  if (input.supplierId) {
    return toBigIntId(input.supplierId);
  }

  const supplierName = normalizeSupplierName(input.supplierName);
  if (!supplierName) {
    throw new Error("供应商必填");
  }

  const existing = await tx.supplier.findFirst({
    where: {
      name: supplierName,
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    return existing.id;
  }

  const created = await tx.supplier.create({
    data: {
      name: supplierName,
    },
    select: {
      id: true,
    },
  });

  return created.id;
}

export async function resolveOptionalSupplierId(
  tx: SupplierResolverClient,
  input: {
    supplierId?: string | null;
    supplierName?: string | null;
  },
) {
  const normalized = normalizeSupplierInput(input);
  if (!normalized.supplierId && !normalized.supplierName) {
    return null;
  }

  return resolveSupplierId(tx, normalized);
}

export function normalizeSupplierInput(
  input: {
    supplierId?: string | null;
    supplierName?: string | null;
  },
) {
  return {
    supplierId: input.supplierId ?? null,
    supplierName: normalizeSupplierName(input.supplierName) || null,
  };
}
