import { authenticateUser, createSession } from "../../../../lib/server/db";
import { json, setSessionCookie } from "../../../../lib/server/http";

export async function POST(request) {
  let user;
  try {
    const body = await request.json();
    user = await authenticateUser({
      email: String(body.email || ""),
      password: String(body.password || ""),
    });
  } catch (error) {
    if (["ECONNREFUSED", "ER_ACCESS_DENIED_ERROR", "ER_BAD_DB_ERROR"].includes(error.code)) {
      return json({ error: "Database is offline. Please start XAMPP MySQL, then try logging in again." }, 503);
    }
    return json({ error: "Login failed. Please try again." }, 500);
  }

  if (!user) {
    return json({ error: "We could not find that email and password combination." }, 401);
  }

  const session = await createSession(user.id);
  const response = json({ user });
  setSessionCookie(response, session.sessionId, session.expiresAt);
  return response;
}
