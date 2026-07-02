import { addSupportMessage } from "../../../../../lib/server/db";
import { getCurrentUserFromRequest, json, unauthorized } from "../../../../../lib/server/http";

export async function POST(request, { params }) {
  const user = await getCurrentUserFromRequest();

  if (!user) {
    return unauthorized();
  }
  if (!user.emailVerified) {
    return json({ error: "Please confirm your email address first." }, 403);
  }

  const body = await request.json();
  const message = String(body.message || "").trim();
  const attachment = body.attachment || null;

  if (!message) {
    return json({ error: "Reply message is required." }, 400);
  }

  const { id } = await params;

  try {
    const supportMessage = await addSupportMessage({
      ticketId: id,
      userId: user.id,
      message,
      senderRole: "customer",
      isAdmin: false,
      attachment,
    });

    if (!supportMessage) {
      return json({ error: "Support ticket not found." }, 404);
    }

    return json({ message: supportMessage });
  } catch (error) {
    return json({ error: error.message || "Support reply failed." }, 400);
  }
}
