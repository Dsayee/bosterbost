import { createPaymentDeposit, updatePaymentDepositStatus } from "../../../../../lib/server/db";
import { getCurrentUserFromRequest, json, unauthorized } from "../../../../../lib/server/http";
import { CURRENCIES, MINIMUM_DEPOSIT_RWF, toRwf } from "../../../../../lib/catalog";
import { initiatePawaPayDeposit, pawaPayStatus, predictPawaPayProvider } from "../../../../../lib/server/pawapay";

export async function POST(request) {
  const user = await getCurrentUserFromRequest();

  if (!user) {
    return unauthorized();
  }
  if (!user.emailVerified) {
    return json({ error: "Please confirm your email address first." }, 403);
  }

  const body = await request.json();
  const amount = Number(body.amount);
  const currency = String(body.currency || "RWF").toUpperCase();
  const phoneNumber = String(body.phoneNumber || "").trim();
  let provider = String(body.provider || "").trim();

  if (!CURRENCIES[currency]) {
    return json({ error: "Unsupported currency." }, 400);
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return json({ error: "Funding amount must be greater than zero." }, 400);
  }
  if (toRwf(amount, currency) < MINIMUM_DEPOSIT_RWF) {
    return json({ error: `Minimum deposit is ${MINIMUM_DEPOSIT_RWF} RWF.` }, 400);
  }
  if (!phoneNumber) {
    return json({ error: "Mobile money phone number is required for PawaPay." }, 400);
  }

  let deposit = null;
  try {
    if (!provider) {
      const prediction = await predictPawaPayProvider(phoneNumber);
      provider = prediction.provider;
    }

    deposit = await createPaymentDeposit({
      userId: user.id,
      amountRwf: toRwf(amount, currency),
      originalAmount: amount,
      originalCurrency: currency,
      payerPhone: phoneNumber,
      payerProvider: provider,
    });

    const pawaPayResponse = await initiatePawaPayDeposit({
      depositId: deposit.providerDepositId,
      amount,
      currency,
      phoneNumber,
      provider,
      userId: user.id,
      userEmail: user.email,
    });

    const initiationStatus = pawaPayStatus(pawaPayResponse);
    const nextStatus = initiationStatus === "ACCEPTED" || initiationStatus === "DUPLICATE_IGNORED" ? "ACCEPTED" : "REJECTED";
    const updatedDeposit = await updatePaymentDepositStatus(deposit.providerDepositId, nextStatus, pawaPayResponse);

    if (nextStatus === "REJECTED") {
      return json({ error: pawaPayResponse.failureReason?.failureMessage || "PawaPay rejected this deposit.", deposit: updatedDeposit }, 400);
    }

    return json({
      deposit: updatedDeposit,
      message: "PawaPay payment request sent. Approve the prompt on your phone, then your wallet will update after confirmation.",
    });
  } catch (error) {
    if (deposit?.providerDepositId) {
      await updatePaymentDepositStatus(deposit.providerDepositId, "FAILED", { error: error.message }).catch(() => null);
    }
    return json({ error: error.message || "PawaPay deposit failed." }, 400);
  }
}
