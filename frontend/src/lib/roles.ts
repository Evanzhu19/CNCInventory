import type { User } from "../types";

export function isAdmin(user: User | null) {
  return user?.role === "ADMIN";
}

export function isProcurementManager(user: User | null) {
  return user?.role === "PROCUREMENT_MANAGER";
}

export function isCncSupervisor(user: User | null) {
  return user?.role === "CNC_SUPERVISOR";
}

export function isGeneralManager(user: User | null) {
  return user?.role === "GENERAL_MANAGER";
}

export function canManageItems(user: User | null) {
  return isProcurementManager(user) || isCncSupervisor(user);
}

export function canManageUsers(user: User | null) {
  return isAdmin(user) || isProcurementManager(user);
}

export function canAccessPurchaseRequests(user: User | null) {
  return isProcurementManager(user) || isCncSupervisor(user);
}

export function canAccessStockMovements(user: User | null) {
  return isProcurementManager(user);
}

export function canAccessAnalytics(user: User | null) {
  return isProcurementManager(user) || isGeneralManager(user);
}

export function canManagePurchaseLists(user: User | null) {
  return isProcurementManager(user);
}

export function roleLabel(role: User["role"]) {
  switch (role) {
    case "ADMIN":
      return "管理员";
    case "CNC_SUPERVISOR":
      return "CNC主管";
    case "PROCUREMENT_MANAGER":
      return "采购主管";
    case "GENERAL_MANAGER":
      return "总经理";
    default:
      return role;
  }
}
