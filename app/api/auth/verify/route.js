import { verifyEmailToken } from "../../../../lib/server/db";
import { json } from "../../../../lib/server/http";

export async function POST(request) {
  const body = await request.json();
  const user = await verifyEmailToken(body.token);

  if (!user) {
    return json({ error: "Verification link is invalid or has already been used." }, 400);
  }

  return json({ user });
}
