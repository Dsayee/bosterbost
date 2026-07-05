import { getCurrentUserFromRequest, json, unauthorized } from "../../../../../../lib/server/http";
import { reconcilePawaPayDeposit } from "../../../../../../lib/server/payment-reconciliation";

export async function GET(_request, { params }) {
  const user = await getCurrentUserFromRequest();

  if (!user) {
    return unauthorized();
  }

  const { id } = await params;
  const result = await reconcilePawaPayDeposit(id);
  return json(result);
}
