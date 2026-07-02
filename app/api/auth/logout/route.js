import { deleteSession } from "../../../../lib/server/db";
import { clearSessionCookie, getSessionId, json } from "../../../../lib/server/http";

export async function POST() {
  await deleteSession(await getSessionId());
  const response = json({ ok: true });
  clearSessionCookie(response);
  return response;
}
