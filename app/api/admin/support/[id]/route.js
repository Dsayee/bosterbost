import { hasAdminAccess, updateSupportTicketStatus } from "../../../../../lib/server/db";
import { getCurrentUserFromRequest, json, unauthorized } from "../../../../../lib/server/http";

const statuses = new Set(["Open", "Customer Reply", "Answered", "Closed"]);

export async function PATCH(request, { params }) {
  const user = await getCurrentUserFromRequest();

  if (!user) {
    return unauthorized();
  }
  if (!hasAdminAccess(user, ["support", "manager", "owner"])) {
    return json({ error: "Admin access required." }, 403);
  }

  const body = await request.json();
  const status = String(body.status || "");

  if (!statuses.has(status)) {
    return json({ error: "Invalid support status." }, 400);
  }

  const { id } = await params;
  const ticket = await updateSupportTicketStatus(id, status);

  if (!ticket) {
    return json({ error: "Support ticket not found." }, 404);
  }

  return json({ ticket });
}
