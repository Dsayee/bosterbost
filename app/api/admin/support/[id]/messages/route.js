import { addSupportMessage, hasAdminAccess, listAllSupportTickets } from "../../../../../../lib/server/db";
import { getCurrentUserFromRequest, json, unauthorized } from "../../../../../../lib/server/http";
import { notifyCustomerTicketUpdated } from "../../../../../../lib/server/notifications";

export async function POST(request, { params }) {
  const user = await getCurrentUserFromRequest();

  if (!user) {
    return unauthorized();
  }
  if (!hasAdminAccess(user, ["support", "manager", "owner"])) {
    return json({ error: "Admin access required." }, 403);
  }

  const body = await request.json();
  const message = String(body.message || "").trim();
  const attachment = body.attachment || null;

  if (!message) {
    return json({ error: "Reply message is required." }, 400);
  }

  const { id } = await params;
  const supportMessage = await addSupportMessage({
    ticketId: id,
    userId: user.id,
    message,
    senderRole: "admin",
    isAdmin: true,
    attachment,
  });

  if (!supportMessage) {
    return json({ error: "Support ticket not found." }, 404);
  }

  const tickets = await listAllSupportTickets();
  const ticket = tickets.find((item) => item.id === (supportMessage.ticketId || supportMessage.ticket_id));
  if (ticket) {
    await notifyCustomerTicketUpdated(request.url, { ticket, reply: message }).catch(() => null);
  }

  return json({ message: supportMessage });
}
