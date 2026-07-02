import { hasAdminAccess, updateUserManagement } from "../../../../../lib/server/db";
import { getCurrentUserFromRequest, json, unauthorized } from "../../../../../lib/server/http";

const roles = new Set(["Influencer", "Brand", "Reseller", "Agency"]);
const adminAccessLevels = new Set(["support", "orders", "finance", "manager", "owner"]);

export async function PATCH(request, { params }) {
  const currentUser = await getCurrentUserFromRequest();

  if (!currentUser) {
    return unauthorized();
  }
  if (!hasAdminAccess(currentUser, ["manager", "owner"])) {
    return json({ error: "Admin access required." }, 403);
  }

  const body = await request.json();
  const role = String(body.role || "");
  const accessLevels = Array.isArray(body.accessLevels)
    ? body.accessLevels.map((level) => String(level))
    : [String(body.accessLevel || "manager")];

  if (!roles.has(role)) {
    return json({ error: "Invalid user role." }, 400);
  }

  if (Boolean(body.isAdmin) && !accessLevels.length) {
    return json({ error: "Invalid admin access level." }, 400);
  }

  if (Boolean(body.isAdmin) && accessLevels.some((level) => !adminAccessLevels.has(level))) {
    return json({ error: "Invalid admin access level." }, 400);
  }

  const { id } = await params;
  const user = await updateUserManagement(id, {
    role,
    isAdmin: Boolean(body.isAdmin),
    accessLevels,
  });

  return json({ user });
}
