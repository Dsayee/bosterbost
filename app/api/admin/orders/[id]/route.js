import { hasAdminAccess, updateOrderStatus } from "../../../../../lib/server/db";
import { getCurrentUserFromRequest, json, unauthorized } from "../../../../../lib/server/http";

const statuses = new Set(["Pending Review", "Processing", "Completed", "Rejected"]);

export async function PATCH(request, { params }) {
  const user = await getCurrentUserFromRequest();
  if (!user) {
    return unauthorized();
  }
  if (!hasAdminAccess(user, ["orders", "manager", "owner"])) {
    return json({ error: "Admin access required." }, 403);
  }

  const body = await request.json();
  const status = String(body.status || "");

  if (!statuses.has(status)) {
    return json({ error: "Invalid order status." }, 400);
  }

  const { id } = await params;
  const order = await updateOrderStatus(id, status);

  if (!order) {
    return json({ error: "Order not found." }, 404);
  }

  return json({ ok: true });
}
