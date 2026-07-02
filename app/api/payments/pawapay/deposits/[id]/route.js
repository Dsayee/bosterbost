import { checkPawaPayDeposit, pawaPayPayload, pawaPayStatus } from "../../../../../../lib/server/pawapay";
import { completePaymentDeposit, updatePaymentDepositStatus } from "../../../../../../lib/server/db";
import { getCurrentUserFromRequest, json, unauthorized } from "../../../../../../lib/server/http";

export async function GET(_request, { params }) {
  const user = await getCurrentUserFromRequest();

  if (!user) {
    return unauthorized();
  }

  const { id } = await params;
  const result = await checkPawaPayDeposit(id);
  const status = pawaPayStatus(result);
  const payload = pawaPayPayload(result);

  if (status === "COMPLETED") {
    const deposit = await completePaymentDeposit(id, payload);
    return json({ status, deposit, pawaPay: result });
  }

  const deposit = status ? await updatePaymentDepositStatus(id, status, payload) : null;
  return json({ status, deposit, pawaPay: result });
}
