import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import XLSX from "xlsx";

const sourcePath = resolve(process.argv[2] || "C:/Users/user/Downloads/social_media_services_pricelist (6).xlsx");
const catalogPath = resolve("lib/catalog.js");
const usdToRwf = 1300;

const workbook = XLSX.readFile(sourcePath);
const sheet = workbook.Sheets["All Services"];

if (!sheet) {
  throw new Error("Workbook must contain an 'All Services' sheet.");
}

const rows = XLSX.utils
  .sheet_to_json(sheet, { defval: "" })
  .filter((row) => String(row["Service Name"] || "").trim() && Number.isFinite(Number(row["New Rate ($)"])));

const cleanText = (value) => String(value || "").replace(/\s+/g, " ").trim();

const numberOrDefault = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

const inferPlatform = (platform, serviceName) => {
  const explicit = cleanText(platform);
  if (explicit) return explicit;

  const name = serviceName.toLowerCase();
  if (name.includes("instagram")) return "Instagram";
  if (name.includes("tiktok") || name.includes("titkot")) return "TikTok";
  if (name.includes("facebook")) return "Facebook";
  if (name.includes("telegram")) return "Telegram";
  if (name.includes("twitter") || name.includes("[x]")) return "Twitter/X";
  if (name.includes("youtube") || name.includes("youtu")) return "YouTube";
  if (name.includes("whatsapp")) return "WhatsApp";
  return "Other";
};

const generatedId = (row, index) => {
  const rawId = cleanText(row["Service ID"]);
  if (rawId && !["-", "—", "–"].includes(rawId)) return `svc-${rawId}`;
  return `svc-xlsx-${String(index + 1).padStart(3, "0")}`;
};

const serviceRows = rows.map((row, index) => {
  const name = cleanText(row["Service Name"]);
  const platform = inferPlatform(row.Platform, name);
  const category = cleanText(row.Category) || "General";
  const module = `${platform} - ${category}`;
  const priceRwf = Number((Number(row["New Rate ($)"]) * usdToRwf).toFixed(4));
  return {
    id: generatedId(row, index),
    module,
    platform,
    name,
    priceRwf,
    min: numberOrDefault(row["Min Order"], 1),
    max: numberOrDefault(row["Max Order"], 1000000),
    sourceRateUsd: Number(Number(row["New Rate ($)"]).toFixed(6)),
  };
});

const current = readFileSync(catalogPath, "utf8");
const serviceStart = current.includes("const inferPlatform")
  ? current.indexOf("const inferPlatform")
  : current.indexOf("const service =");

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
