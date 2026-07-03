import { completePaymentDeposit, updatePaymentDepositStatus } from "../../../../../lib/server/db";
import { json } from "../../../../../lib/server/http";
import { pawaPayDepositId, pawaPayPayload, pawaPayStatus } from "../../../../../lib/server/pawapay";

const callbackAllowed = (request) => {
  const secret = process.env.PAWAPAY_CALLBACK_SECRET;
  if (!secret) return true;
  return (
    new URL(request.url).searchParams.get("secret") === secret ||
    request.headers.get("x-boster-pawapay-secret") === secret ||
    request.headers.get("x-callback-secret") === secret
  );
};

export async function GET(request) {
  return json({
    ok: true,
    provider: "pawapay",
    callbackUrl: `${new URL(request.url).origin}/api/payments/pawapay/callback`,
    method: "POST",
  });
}

export async function POST(request) {
  if (!callbackAllowed(request)) {
    return json({ error: "Invalid callback secret." }, 401);
  }

  const body = await request.json();
  const payload = pawaPayPayload(body);
  const depositId = pawaPayDepositId(body) || String(payload.depositId || body.depositId || "").trim();
  const status = pawaPayStatus(body) || String(payload.status || body.status || "").toUpperCase();

  if (!depositId || !status) {
    return json({ error: "Missing depositId or status." }, 400);
  }

  if (status === "COMPLETED") {
    const deposit = await completePaymentDeposit(depositId, body);
    return json({ received: true, deposit });
  }

  const deposit = await updatePaymentDepositStatus(depositId, status, body);
  return json({ received: true, deposit });
}
