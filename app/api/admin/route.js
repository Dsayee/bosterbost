import {
  getAdminDashboardStats,
  hasAdminAccess,
  listAllOrders,
  listAllSupportTickets,
  listAllWalletTransactions,
  listUsersWithOrderCounts,
} from "../../../lib/server/db";
import { getCurrentUserFromRequest, json, unauthorized } from "../../../lib/server/http";

export async function GET() {
  const user = await getCurrentUserFromRequest();
  if (!user) {
    return unauthorized();
  }
  if (!hasAdminAccess(user)) {
    return json({ error: "Admin access required." }, 403);
  }

  const levels = user.accessLevels?.length ? user.accessLevels : [user.accessLevel];
  const canViewAll = levels.some((level) => ["owner", "manager"].includes(level));
  const canViewOrders = canViewAll || levels.includes("orders");
  const canViewSupport = canViewAll || levels.includes("support");
  const canViewFinance = canViewAll || levels.includes("finance");
  const canManageUsers = canViewAll;
  const stats = await getAdminDashboardStats();
  const [usersResult, ordersResult, supportResult, walletResult] = await Promise.allSettled([
    canViewAll || canViewFinance ? listUsersWithOrderCounts() : Promise.resolve([]),
    canViewOrders ? listAllOrders() : Promise.resolve([]),
    canViewSupport ? listAllSupportTickets() : Promise.resolve([]),
    canViewFinance ? listAllWalletTransactions() : Promise.resolve([]),
  ]);

  return json({
    currentAdmin: user,
    permissions: { canViewAll, canViewOrders, canViewSupport, canViewFinance, canManageUsers },
    stats,
    users: usersResult.status === "fulfilled" ? usersResult.value : [],
    orders: ordersResult.status === "fulfilled" ? ordersResult.value : [],
    supportTickets: supportResult.status === "fulfilled" ? supportResult.value : [],
    walletTransactions: walletResult.status === "fulfilled" ? walletResult.value : [],
    listErrors: {
      users: usersResult.status === "rejected" ? usersResult.reason.message : "",
      orders: ordersResult.status === "rejected" ? ordersResult.reason.message : "",
      supportTickets: supportResult.status === "rejected" ? supportResult.reason.message : "",
      walletTransactions: walletResult.status === "rejected" ? walletResult.reason.message : "",
    },
  });
}
