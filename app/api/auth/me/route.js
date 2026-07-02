import { getCurrentUserFromRequest, json, unauthorized } from "../../../../lib/server/http";

export async function GET() {
  const user = await getCurrentUserFromRequest();

  if (!user) {
    return unauthorized();
  }

  return json({ user });
}
