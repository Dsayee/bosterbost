import { getAdminDashboardStats, hasAdminAccess } from "../../../../lib/server/db";
import { getCurrentUserFromRequest, json, unauthorized } from "../../../../lib/server/http";

const permissionsForUser = (user) => {
  const levels = user.accessLevels?.length ? user.accessLevels : [user.accessLevel];
  const canViewAll = levels.some((level) => ["owner", "manager"].includes(level));
  const canViewOrders = canViewAll || levels.includes("orders");
  const canViewSupport = canViewAll || levels.includes("support");
  const canViewFinance = canViewAll || levels.includes("finance");

  return {
    canViewAll,
    canViewOrders,
    canViewSupport,
    canViewFinance,
    canManageUsers: canViewAll,
  };
};

export async function GET() {
  const user = await getCurrentUserFromRequest();
  if (!user) {
    return unauthorized();
  }
  if (!hasAdminAccess(user)) {
    return json({ error: "Admin access required." }, 403);
  }

  return json({
    currentAdmin: user,
    permissions: permissionsForUser(user),
    stats: await getAdminDashboardStats(),
  });
}
