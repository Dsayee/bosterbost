import { createPaymentDeposit, updatePaymentDepositStatus } from "../../../../../lib/server/db";
import { getCurrentUserFromRequest, json, unauthorized } from "../../../../../lib/server/http";
import {
  CURRENCIES,
  MANUAL_DEPOSIT_WHATSAPP,
  MINIMUM_DEPOSIT_RWF,
  PAWAPAY_COUNTRY_BY_CURRENCY,
  PAYMENT_NOT_AVAILABLE_MESSAGE,
  toRwf,
} from "../../../../../lib/catalog";
import { initiatePawaPayPaymentPage } from "../../../../../lib/server/pawapay";

const appBaseUrl = (request) => (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, "");

const getRedirectUrl = (result) => {
  const payload = result?.data || result || {};
  return payload.redirectUrl || payload.paymentPageUrl || payload.url || "";
};

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
  const country = PAWAPAY_COUNTRY_BY_CURRENCY[currency] || null;

  if (!CURRENCIES[currency]) {
    return json({ error: "Unsupported currency." }, 400);
  }
  if (!country) {
    return json({ error: `${PAYMENT_NOT_AVAILABLE_MESSAGE} ${MANUAL_DEPOSIT_WHATSAPP}` }, 400);
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return json({ error: "Funding amount must be greater than zero." }, 400);
  }
  if (toRwf(amount, currency) < MINIMUM_DEPOSIT_RWF) {
    return json({ error: `Minimum deposit is ${MINIMUM_DEPOSIT_RWF} RWF.` }, 400);
  }

  let deposit = null;
  try {
    deposit = await createPaymentDeposit({
      userId: user.id,
      amountRwf: toRwf(amount, currency),
      originalAmount: amount,
      originalCurrency: currency,
      payerPhone: "",
      payerProvider: country.code,
    });

    const returnUrl = `${appBaseUrl(request)}/dashboard/wallet?payment=pawapay&depositId=${encodeURIComponent(deposit.providerDepositId)}`;
    const pawaPayResponse = await initiatePawaPayPaymentPage({
      depositId: deposit.providerDepositId,
      amount,
      currency,
      country: country.code,
      userId: user.id,
      userEmail: user.email,
      returnUrl,
    });
    const redirectUrl = getRedirectUrl(pawaPayResponse);
    const updatedDeposit = await updatePaymentDepositStatus(deposit.providerDepositId, "PAYMENT_PAGE_CREATED", pawaPayResponse);

    if (!redirectUrl) {
      return json({ error: "PawaPay did not return a secure payment URL.", deposit: updatedDeposit }, 400);
    }

    return json({
      deposit: updatedDeposit,
      redirectUrl,
      message: "Redirecting to PawaPay secure payment.",
    });
  } catch (error) {
    if (deposit?.providerDepositId) {
      await updatePaymentDepositStatus(deposit.providerDepositId, "FAILED", { error: error.message }).catch(() => null);
    }
    return json({ error: error.message || "PawaPay secure payment failed." }, 400);
  }
}
