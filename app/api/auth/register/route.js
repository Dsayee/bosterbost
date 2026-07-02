import { createUser } from "../../../../lib/server/db";
import { buildVerificationUrl, sendVerificationEmail } from "../../../../lib/server/email";
import { json } from "../../../../lib/server/http";

export async function POST(request) {
  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const role = String(body.role || "Influencer");
    const password = String(body.password || "");

    if (!name || !email || password.length < 6) {
      return json({ error: "Please enter your name, email, and a password with at least 6 characters." }, 400);
    }

    const createdUser = await createUser({ name, email, role, password });
    const { verificationToken, ...user } = createdUser;
    const verificationUrl = buildVerificationUrl(request.url, verificationToken);
    const emailDelivery = await sendVerificationEmail({ to: email, name, verificationUrl }).catch((emailError) => ({
      sent: false,
      reason: emailError.message,
    }));

    return json(
      {
        user,
        emailSent: emailDelivery.sent,
        emailMessage: emailDelivery.sent
          ? "Confirmation email sent. Please check your inbox."
          : "Confirmation email could not be sent. Please contact support so we can verify your email delivery settings.",
        verificationUrl: emailDelivery.sent || process.env.NODE_ENV === "production" ? "" : verificationUrl,
      },
      201
    );
  } catch (error) {
    if (["ECONNREFUSED", "ER_ACCESS_DENIED_ERROR", "ER_BAD_DB_ERROR"].includes(error.code)) {
      return json({ error: "Database is offline. Please start XAMPP MySQL, then try again." }, 503);
    }

    if (
      String(error.message || "").includes("UNIQUE") ||
      String(error.message || "").includes("duplicate key") ||
      String(error.message || "").includes("Duplicate entry")
    ) {
      return json({ error: "That email is already registered. Log in instead." }, 409);
    }

    return json({ error: "Registration failed. Please try again." }, 500);
  }
}
