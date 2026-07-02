import { createSupportTicket, listSupportTicketsForUser } from "../../../lib/server/db";
import { getCurrentUserFromRequest, json, unauthorized } from "../../../lib/server/http";
import { notifyCustomerTicketReceived } from "../../../lib/server/notifications";

export async function GET() {
  const user = await getCurrentUserFromRequest();

  if (!user) {
    return unauthorized();
  }
  if (!user.emailVerified) {
    return json({ error: "Please confirm your email address first." }, 403);
  }

  return json({ tickets: await listSupportTicketsForUser(user.id) });
}

export async function POST(request) {
  const user = await getCurrentUserFromRequest();

  if (!user) {
    return unauthorized();
  }
  if (!user.emailVerified) {
    return json({ error: "Please confirm your email address first." }, 403);
  }

  const body = await request.json();
  const subject = String(body.subject || "").trim();
  const category = String(body.category || "General").trim();
  const message = String(body.message || "").trim();
  const orderId = String(body.orderId || "").trim();
  const attachment = body.attachment || null;

  if (!subject || !message) {
    return json({ error: "Please add a subject and message for support." }, 400);
  }

  const ticket = await createSupportTicket(user.id, { subject, category, message, orderId, attachment });
  await notifyCustomerTicketReceived(request.url, { customer: user, ticket }).catch(() => null);
  return json({ ticket }, 201);
}
