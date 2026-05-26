export type User = {
  id: string;
  username: string;
  realName: string;
  role: "ADMIN" | "CNC_SUPERVISOR" | "PROCUREMENT_MANAGER" | "GENERAL_MANAGER";
};

export type ManagedUser = {
  id: string;
  username: string;
  realName: string;
  role: User["role"];
  status: number;
  createdAt: string;
  updatedAt: string;
};

export type Category = {
  id: string;
  name: string;
  parentId?: string | null;
  level: number;
};

export type Supplier = {
  id: string;
  name: string;
  channel?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  remark?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type Item = {
  id: string;
  itemCode: string;
  name: string;
  specification?: string | null;
  brand?: string | null;
  categoryId?: string;
  unit: string;
  trackingMode: "CLOSED_LOOP" | "CONSUMABLE" | "HIGH_VALUE_CONSUMABLE" | "REPAIR_PENDING";
  safeStock: string;
  defaultSupplierId?: string | null;
  defaultPrice?: string | null;
  remark?: string | null;
  category?: Category;
  defaultSupplier?: Supplier | null;
};

export type InventoryRow = {
  id: string;
  availableQty: string;
  borrowedQty: string;
  pendingQty: string;
  status: "normal" | "low_stock" | "out_of_stock";
  item: Item;
};

export type PriceHistoryRecord = {
  id: string;
  qty: string;
  unitPrice: string;
  totalPrice: string;
  purchaseChannel?: string | null;
  createdAt: string;
  supplier?: { name: string | null } | null;
  stockIn: {
    inNo: string;
    inTime: string;
    supplier?: { name: string | null } | null;
  };
};

export type ItemDetail = {
  item: Item & {
    defaultSupplier?: Supplier | null;
  };
  inventory?: {
    availableQty: string;
    borrowedQty: string;
    pendingQty: string;
  } | null;
  priceSummary: {
    latestPrice?: string | null;
    latestSupplier?: string | null;
    latestPurchaseTime?: string | null;
    averagePrice?: string | null;
    minPrice?: string | null;
    maxPrice?: string | null;
    priceRecordCount: number;
  };
  priceHistory: PriceHistoryRecord[];
  recentStockOuts: Array<{
    id: string;
    qty: string;
    stockOut: {
      outNo: string;
      outTime: string;
      receiverName: string;
      purpose?: string | null;
    };
  }>;
};

export type PurchaseRequestItem = {
  id: string;
  itemId?: string | null;
  requestedName: string;
  requestedSpecification?: string | null;
  requestedBrand?: string | null;
  requestedUnit?: string | null;
  requestedQty: string;
  reason?: string | null;
  item?: Item | null;
  purchaseListLinks?: Array<{
    purchaseListItem: {
      purchaseList: {
        id: string;
        listNo: string;
        status: "PENDING" | "PURCHASING" | "ARRIVED" | "COMPLETED" | "CANCELLED";
      };
    };
  }>;
};

export type PurchaseRequest = {
  id: string;
  requestNo: string;
  status: "PENDING" | "MERGED" | "PURCHASED" | "CANCELLED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  requestTime: string;
  remark?: string | null;
  requester: {
    id: string;
    realName: string;
  };
  items: PurchaseRequestItem[];
};

export type PurchaseListRequestLink = {
  id: string;
  qty: string;
  purchaseRequestItem: {
    id: string;
    requestedName: string;
    requestedSpecification?: string | null;
    requestedUnit?: string | null;
    requestedQty: string;
    purchaseRequest: {
      id: string;
      requestNo: string;
      status: PurchaseRequest["status"];
      requester: {
        id: string;
        realName: string;
      };
    };
  };
};

export type PurchaseListItem = {
  id: string;
  itemId?: string | null;
  itemName: string;
  specification?: string | null;
  brand?: string | null;
  unit?: string | null;
  qty: string;
  referencePrice?: string | null;
  referenceSupplierId?: string | null;
  status: "PENDING" | "ORDERED" | "ARRIVED" | "STOCKED_IN" | "CANCELLED";
  remark?: string | null;
  item?: Item | null;
  referenceSupplier?: Supplier | null;
  requestItemLinks: PurchaseListRequestLink[];
  stockInItems: Array<{
    id: string;
    qty: string;
    unitPrice: string;
    stockIn: {
      id: string;
      inNo: string;
      inTime: string;
    };
  }>;
};

export type CancelRequest = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requestTime: string;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  reviewer?: { id: string; realName: string } | null;
};

export type PurchaseList = {
  id: string;
  listNo: string;
  status: "PENDING" | "PURCHASING" | "ARRIVED" | "COMPLETED" | "CANCELLED";
  remark?: string | null;
  createdAt: string;
  cancelRequest?: CancelRequest | null;
  creator: {
    id: string;
    realName: string;
  };
  items: PurchaseListItem[];
  stockIns: Array<{
    id: string;
    inNo: string;
    inTime: string;
    totalAmount: string;
    supplier?: {
      name?: string | null;
    } | null;
  }>;
};

export type StockInRecord = {
  id: string;
  inNo: string;
  inTime: string;
  totalAmount: string;
  remark?: string | null;
  supplier?: Supplier | null;
  purchaseList?: {
    id: string;
    listNo: string;
  } | null;
  items: Array<{
    id: string;
    qty: string;
    unitPrice: string;
    purchaseChannel?: string | null;
    remark?: string | null;
    item: Item;
    supplier?: Supplier | null;
  }>;
};

export type StockOutRecord = {
  id: string;
  outNo: string;
  outTime: string;
  receiverName: string;
  department?: string | null;
  purpose?: string | null;
  remark?: string | null;
  items: Array<{
    id: string;
    qty: string;
    item: Item;
  }>;
};

export type RecoveryRecord = {
  id: string;
  qty: string;
  returnedBy: string;
  recoveryTime: string;
  recoveryStatus: "REUSABLE" | "ROUGHING_REUSABLE" | "PENDING_INSPECTION" | "REPAIRABLE" | "SCRAPPED";
  remark?: string | null;
  item: Item;
  operator: {
    id: string;
    realName: string;
  };
};

export type LossRecord = {
  id: string;
  qty: string;
  lossType: "NORMAL_WEAR" | "BROKEN" | "SCRAPPED" | "LOST" | "OTHER";
  sourceBucket: "AVAILABLE" | "BORROWED" | "PENDING";
  responsiblePerson?: string | null;
  recordTime: string;
  remark?: string | null;
  item: Item;
  operator: {
    id: string;
    realName: string;
  };
};

export type DeleteRequest = {
  id: string;
  targetType: "recovery" | "purchase_list";
  targetId: string;
  targetDesc: Record<string, unknown>;
  requestedBy: string;
  requestTime: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewedAt?: string | null;
  reviewNote?: string | null;
  requester: { id: string; realName: string };
  reviewer?: { id: string; realName: string } | null;
};

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type AnalyticsReport = {
  range: "month" | "half_year" | "year";
  anchorMonth: string;
  period: {
    startMonth: string;
    endMonth: string;
    startDate: string;
    endDate: string;
  };
  totals: {
    stockInQty: number;
    stockInAmount: number;
    stockOutQty: number;
    recoveryQty: number;
    lossQty: number;
    netUsageQty: number;
    recoveryRate: number;
    lossRate: number;
  };
  monthly: Array<{
    month: string;
    stockInQty: number;
    stockInAmount: number;
    stockOutQty: number;
    recoveryQty: number;
    lossQty: number;
    netUsageQty: number;
  }>;
  itemRanking: {
    data: Array<{
      itemId: string;
      itemCode: string;
      itemName: string;
      specification?: string | null;
      stockInQty: number;
      stockInAmount: number;
      stockOutQty: number;
      recoveryQty: number;
      lossQty: number;
      netUsageQty: number;
      lossRate: number;
    }>;
    pagination: PaginationMeta;
  };
  sourceAnalysis: {
    data: Array<{
      supplierName?: string | null;
      purchaseChannel?: string | null;
      purchasedQty: number;
      purchasedAmount: number;
      attributedUsageQty: number;
      attributedRecoveryQty: number;
      attributedLossQty: number;
      netUsageQty: number;
      lossRate: number;
    }>;
    pagination: PaginationMeta;
  };
  notes: {
    sourceAttribution: string;
  };
};

export type AnalyticsHistoryType = "stock_in" | "stock_out" | "recovery" | "loss";

export type AnalyticsHistoryResponse = {
  type: AnalyticsHistoryType;
  data: Array<
    | {
        id: string;
        inNo: string;
        inTime: string;
        qty: string;
        unitPrice: string;
        totalPrice: string;
        purchaseChannel?: string | null;
        supplierName?: string | null;
        item: Item;
      }
    | {
        id: string;
        outNo: string;
        outTime: string;
        qty: string;
        receiverName: string;
        department?: string | null;
        purpose?: string | null;
        item: Item;
      }
    | {
        id: string;
        recoveryTime: string;
        qty: string;
        returnedBy: string;
        recoveryStatus: RecoveryRecord["recoveryStatus"];
        remark?: string | null;
        operator: {
          id: string;
          realName: string;
        };
        item: Item;
      }
    | {
        id: string;
        recordTime: string;
        qty: string;
        lossType: LossRecord["lossType"];
        sourceBucket: LossRecord["sourceBucket"];
        responsiblePerson?: string | null;
        remark?: string | null;
        operator: {
          id: string;
          realName: string;
        };
        item: Item;
      }
  >;
  pagination: PaginationMeta;
};
