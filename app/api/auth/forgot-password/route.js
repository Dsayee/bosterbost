import { createPasswordResetToken } from "../../../../lib/server/db";
import { buildPasswordResetUrl, sendPasswordResetEmail } from "../../../../lib/server/email";
import { json } from "../../../../lib/server/http";

export async function POST(request) {
  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase();

  if (!email) {
    return json({ error: "Email address is required." }, 400);
  }

  let reset;
  try {
    reset = await createPasswordResetToken(email);
  } catch (error) {
    if (["ECONNREFUSED", "ER_ACCESS_DENIED_ERROR", "ER_BAD_DB_ERROR"].includes(error.code)) {
      return json({ error: "Database is offline. Please start XAMPP MySQL, then try again." }, 503);
    }
    return json({ error: "Password reset failed. Please try again." }, 500);
  }

  if (!reset) {
    return json({
      ok: true,
      emailSent: false,
      message: "If that email exists, a password reset link will be sent.",
    });
  }

  const resetUrl = buildPasswordResetUrl(request.url, reset.token);
  const emailDelivery = await sendPasswordResetEmail({
    to: reset.user.email,
    name: reset.user.name,
    resetUrl,
  }).catch((error) => ({
    sent: false,
    reason: error.message,
  }));

  return json({
    ok: true,
    emailSent: emailDelivery.sent,
    message: emailDelivery.sent
      ? "Password reset email sent. Please check your inbox."
      : "Password reset email was not sent. Use the local reset link or check email settings.",
    resetUrl: emailDelivery.sent ? "" : resetUrl,
  });
}
