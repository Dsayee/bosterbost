import { createHash, createPrivateKey, createSign } from "node:crypto";

const pawaPayBaseUrl = () => {
  const configured = process.env.PAWAPAY_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");
  return process.env.PAWAPAY_ENV === "production" ? "https://api.pawapay.io" : "https://api.sandbox.pawapay.io";
};

export const pawaPayConfigured = () => Boolean(process.env.PAWAPAY_API_TOKEN);

const pawaPaySigningConfigured = () => Boolean(process.env.PAWAPAY_SIGNATURE_KEY_ID && process.env.PAWAPAY_PRIVATE_KEY);

const normalizePrivateKey = () => {
  const value = String(process.env.PAWAPAY_PRIVATE_KEY || "").trim();
  if (!value) return "";
  if (value.includes("BEGIN PRIVATE KEY")) return value.replace(/\\n/g, "\n");

  try {
    return Buffer.from(value, "base64").toString("utf8");
  } catch {
    return value;
  }
};

const signPawaPayRequest = ({ method, url, body, contentType }) => {
  if (!pawaPaySigningConfigured() || !body) return {};

  const parsedUrl = new URL(url);
  const created = Math.floor(Date.now() / 1000);
  const expires = created + 60;
  const signatureDate = new Date(created * 1000).toISOString();
  const contentDigest = `sha-512=:${createHash("sha512").update(body).digest("base64")}:`;
  const signatureParams = `("@method" "@authority" "@path" "signature-date" "content-digest" "content-type");alg="ecdsa-p256-sha256";keyid="${process.env.PAWAPAY_SIGNATURE_KEY_ID}";created=${created};expires=${expires}`;
  const signatureBase = [
    `"@method": ${method.toUpperCase()}`,
    `"@authority": ${parsedUrl.host}`,
    `"@path": ${parsedUrl.pathname}${parsedUrl.search}`,
    `"signature-date": ${signatureDate}`,
    `"content-digest": ${contentDigest}`,
    `"content-type": ${contentType}`,
    `"@signature-params": ${signatureParams}`,
  ].join("\n");

  const signer = createSign("SHA256");
  signer.update(signatureBase);
  signer.end();
  const signature = signer.sign(createPrivateKey(normalizePrivateKey())).toString("base64");

  return {
    "content-digest": contentDigest,
    "signature-date": signatureDate,
    signature: `sig-pp=:${signature}:`,
    "signature-input": `sig-pp=${signatureParams}`,
    "accept-signature": "ecdsa-p256-sha256",
    "accept-digest": "sha-512",
  };
};

const pawaPayRequest = async (path, options = {}) => {
  if (!pawaPayConfigured() || process.env.PAWAPAY_API_TOKEN === "paste-your-pawapay-token-here") {
    throw new Error("PawaPay is not configured. Add PAWAPAY_API_TOKEN to your environment.");
  }

  const url = `${pawaPayBaseUrl()}${path}`;
  const method = options.method || "GET";
  const body = typeof options.body === "string" ? options.body : options.body ? JSON.stringify(options.body) : undefined;
  const contentType = "application/json; charset=UTF-8";
  const signatureHeaders = signPawaPayRequest({ method, url, body, contentType });

  const response = await fetch(url, {
    ...options,
    body,
    headers: {
      authorization: `Bearer ${process.env.PAWAPAY_API_TOKEN}`,
      "content-type": contentType,
      ...signatureHeaders,
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("PawaPay authorization failed. Check that PAWAPAY_API_TOKEN matches PAWAPAY_ENV and restart the server.");
    }
    throw new Error(data?.message || data?.error || `PawaPay request failed with status ${response.status}.`);
  }

  return data;
};

export const pawaPayPayload = (result) => result?.data || result || {};

export const pawaPayStatus = (result) => String(pawaPayPayload(result).status || result?.status || "").toUpperCase();

export const pawaPayDepositId = (result) => String(pawaPayPayload(result).depositId || result?.depositId || "").trim();

const formatPawaPayAmount = (amount) =>
  Number(amount)
    .toFixed(4)
    .replace(/0+$/, "")
    .replace(/\.$/, "");

export const predictPawaPayProvider = (phoneNumber) =>
  pawaPayRequest("/v2/predict-provider", {
    method: "POST",
    body: JSON.stringify({ phoneNumber }),
  });

export const initiatePawaPayDeposit = ({ depositId, amount, currency, phoneNumber, provider, userId, userEmail }) =>
  pawaPayRequest("/v2/deposits", {
    method: "POST",
    body: JSON.stringify({
      depositId,
      amount: formatPawaPayAmount(amount),
      currency,
      payer: {
        type: "MMO",
        accountDetails: {
          phoneNumber,
          provider,
        },
      },
      clientReferenceId: `BB-${depositId.slice(0, 8)}`,
      customerMessage: "Boster Bost",
      metadata: [
        { customerId: userId },
        { customerEmail: userEmail, isPII: true },
      ],
    }),
  });

export const checkPawaPayDeposit = (depositId) => pawaPayRequest(`/v2/deposits/${encodeURIComponent(depositId)}`);
