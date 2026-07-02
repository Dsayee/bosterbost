import { backendMode } from "../../../../lib/server/db";
import { json } from "../../../../lib/server/http";

export async function GET() {
  return json({
    mode: backendMode(),
  });
}
