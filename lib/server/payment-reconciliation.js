import { completePaymentDeposit, listPendingPaymentDeposits, updatePaymentDepositStatus } from "./db";
import { checkPawaPayDeposit, pawaPayPayload, pawaPayStatus } from "./pawapay";

const terminalFailureStatuses = new Set(["FAILED", "REJECTED", "CANCELLED", "CANCELED", "EXPIRED"]);

export const reconcilePawaPayDeposit = async (providerDepositId) => {
  const result = await checkPawaPayDeposit(providerDepositId);
  const status = pawaPayStatus(result);
  const payload = pawaPayPayload(result);

  if (status === "COMPLETED") {
    const deposit = await completePaymentDeposit(providerDepositId, payload);
    return { providerDepositId, status, deposit };
  }

  if (terminalFailureStatuses.has(status)) {
    const deposit = await updatePaymentDepositStatus(providerDepositId, status, payload);
    return { providerDepositId, status, deposit };
  }

  return { providerDepositId, status: status || "PENDING", deposit: null };
};

export const reconcilePendingPawaPayDeposits = async ({ userId = "", limit = 10 } = {}) => {
  const deposits = await listPendingPaymentDeposits({ userId, limit });
  const results = [];

  for (const deposit of deposits) {
    try {
      results.push(await reconcilePawaPayDeposit(deposit.providerDepositId));
    } catch (error) {
      results.push({
        providerDepositId: deposit.providerDepositId,
        status: "ERROR",
        error: error.message,
      });
    }
  }

  return {
    checked: deposits.length,
    completed: results.filter((result) => result.status === "COMPLETED").length,
    failed: results.filter((result) => terminalFailureStatuses.has(result.status)).length,
    errors: results.filter((result) => result.status === "ERROR").length,
    results,
  };
};
