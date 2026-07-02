import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const sourcePath = resolve(process.argv[2] || "C:/Users/user/.codex/attachments/283995da-4c22-4177-ae46-6223f721c800/pasted-text.txt");
const catalogPath = resolve("lib/catalog.js");
const usdToRwf = 1300;

const cleanText = (value) =>
  String(value || "")
    .replaceAll("â€”", "")
    .replaceAll("â€“", "-")
    .replaceAll("â€˜", "'")
    .replaceAll("â€™", "'")
    .replaceAll("â€œ", '"')
    .replaceAll("â€", '"')
    .replace(/\s+/g, " ")
    .trim();

const parsePrice = (value) => {
  const numeric = Number(String(value || "").replace(/[$,]/g, "").trim());
  return Number.isFinite(numeric) ? numeric : null;
};

const numberOrDefault = (value, fallback) => {
  const numeric = Number(String(value || "").replace(/,/g, "").trim());
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

const inferPlatform = (platform, serviceName) => {
  const explicit = cleanText(platform);
  if (explicit) return explicit;

  const name = serviceName.toLowerCase();
  if (name.includes("instagram") || name.startsWith("ig ")) return "Instagram";
  if (name.includes("tiktok") || name.includes("titkot")) return "TikTok";
  if (name.includes("facebook")) return "Facebook";
  if (name.includes("telegram")) return "Telegram";
  if (name.includes("twitter") || name.includes("[x]")) return "Twitter/X";
  if (name.includes("youtube") || name.includes("youtu")) return "YouTube";
  if (name.includes("whatsapp")) return "WhatsApp";
  if (name.includes("linkedin")) return "LinkedIn";
  if (name.includes("spotify")) return "Spotify";
  if (name.includes("soundcloud")) return "SoundCloud";
  if (name.includes("audiomack")) return "Audiomack";
  return "Other";
};

const raw = readFileSync(sourcePath, "utf8");
const lines = raw.split(/\r?\n/).filter((line) => line.trim());
const headers = lines.shift().split("\t").map(cleanText);
const requiredHeaders = ["Platform", "Service ID", "Service Name", "Category", "Min Order", "Max Order", "Markup Applied", "New Rate ($)"];

for (const header of requiredHeaders) {
  if (!headers.includes(header)) {
    throw new Error(`Missing required catalog header: ${header}`);
  }
}

const rows = lines
  .map((line) => {
    const cells = line.split("\t");
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
  })
  .filter((row) => cleanText(row["Service Name"]) && parsePrice(row["New Rate ($)"]) !== null);

const usedIds = new Map();
const generatedId = (row, index) => {
  const rawId = cleanText(row["Service ID"]);
  const base = rawId && !["-", "—"].includes(rawId) ? `svc-${rawId}` : `svc-text-${String(index + 1).padStart(3, "0")}`;
  const count = usedIds.get(base) || 0;
  usedIds.set(base, count + 1);
  return count ? `${base}-${count + 1}` : base;
};

const serviceRows = rows.map((row, index) => {
  const originalRateUsd = parsePrice(row["New Rate ($)"]);
  const discountedRateUsd = originalRateUsd > 40 ? originalRateUsd * 0.8 : originalRateUsd;
  const name = cleanText(row["Service Name"]);
  const platform = inferPlatform(row.Platform, name);
  const category = cleanText(row.Category) || "General";

  return {
    id: generatedId(row, index),
    module: `${platform} - ${category}`,
    platform,
    name,
    priceRwf: Number((discountedRateUsd * usdToRwf).toFixed(4)),
    min: numberOrDefault(row["Min Order"], 1),
    max: numberOrDefault(row["Max Order"], 1000000),
    sourceRateUsd: Number(discountedRateUsd.toFixed(6)),
  };
});

const current = readFileSync(catalogPath, "utf8");
const serviceStart = current.indexOf("const service =");

if (serviceStart < 0) {
  throw new Error("Could not find the service catalog marker in lib/catalog.js.");
}

const currencyBlock = current.slice(0, serviceStart);
const serviceLines = serviceRows
  .map(
    (service) =>
      `  service(${JSON.stringify(service.id)}, ${JSON.stringify(service.module)}, ${JSON.stringify(service.platform)}, ${JSON.stringify(
        service.name
      )}, ${service.priceRwf}, ${service.min}, ${service.max}, ${service.sourceRateUsd})`
  )
  .join(",\n");

const nextCatalog = `${currencyBlock}const service = (id, module, platform, name, priceRwf, min, max, sourceRateUsd) => ({
  id,
  module,
  platform,
  name,
  priceRwf,
  min,
  max,
  sourceRateUsd,
});

export const SERVICE_CATALOG = [
${serviceLines}
];

export const SERVICE_MODULES = [...new Set(SERVICE_CATALOG.map((item) => item.module))];

export const SERVICE_PLATFORMS = [...new Set(SERVICE_CATALOG.map((item) => item.platform))].filter((platform) => platform !== "Other");

export const SERVICE_IMPORT_SOURCE = ${JSON.stringify(basename(sourcePath))};

export const SERVICE_PRICING_RULE = "Imported USD catalog; rates above $40 reduced by 20%, then converted to RWF at 1300 RWF/USD.";

export const findService = (serviceId) => SERVICE_CATALOG.find((item) => item.id === serviceId);

export const toRwf = (amount, currency) => {
  const selectedCurrency = CURRENCIES[currency] || CURRENCIES.RWF;
  return Number(amount) * selectedCurrency.rateToRwf;
};

export const fromRwf = (amountRwf, currency) => {
  const selectedCurrency = CURRENCIES[currency] || CURRENCIES.RWF;
  return Number(amountRwf) / selectedCurrency.rateToRwf;
};

export const formatMoney = (amount, currency = "RWF") => {
  const selectedCurrency = CURRENCIES[currency] || CURRENCIES.RWF;
  const numericAmount = Number(amount);
  const value = currency === "RWF" || Math.abs(numericAmount) < 1 ? numericAmount.toFixed(4) : numericAmount.toFixed(2);
  return currency === "USD" ? \`\${selectedCurrency.symbol}\${value}\` : \`\${value} \${selectedCurrency.symbol}\`;
};
`;

writeFileSync(catalogPath, nextCatalog);
console.log(`Imported ${serviceRows.length} services from ${sourcePath}`);
console.log(`Discounted ${rows.filter((row) => parsePrice(row["New Rate ($)"]) > 40).length} rates above $40 by 20%.`);
