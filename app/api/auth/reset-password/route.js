import { resetPasswordWithToken } from "../../../../lib/server/db";
import { json } from "../../../../lib/server/http";

export async function POST(request) {
  const body = await request.json();
  const token = String(body.token || "").trim();
  const password = String(body.password || "");

  if (!token || password.length < 6) {
    return json({ error: "Reset token and a password of at least 6 characters are required." }, 400);
  }

  const user = await resetPasswordWithToken({ token, password });

  if (!user) {
    return json({ error: "Reset link is invalid or expired." }, 400);
  }

  return json({ ok: true });
}
