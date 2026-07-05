import { getAdminDashboardStats, hasAdminAccess } from "../../lib/server/db";
import { getCurrentUserFromRequest } from "../../lib/server/http";
import { reconcilePendingPawaPayDeposits } from "../../lib/server/payment-reconciliation";
import AdminDashboardClient from "./AdminDashboardClient";

export const dynamic = "force-dynamic";

const permissionsForUser = (user) => {
  const levels = user?.accessLevels?.length ? user.accessLevels : [user?.accessLevel].filter(Boolean);
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

export default async function AdminPage() {
  const user = await getCurrentUserFromRequest();
  const canViewAdmin = user && hasAdminAccess(user);

  if (!canViewAdmin) {
    return <AdminDashboardClient />;
  }

  await reconcilePendingPawaPayDeposits({ limit: 20 }).catch(() => null);

  return (
    <AdminDashboardClient
      initialStats={await getAdminDashboardStats()}
      initialCurrentAdmin={user}
      initialPermissions={permissionsForUser(user)}
    />
  );
}
