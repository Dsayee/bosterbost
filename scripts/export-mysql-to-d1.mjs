import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import mysql from "mysql2/promise";

const envPath = join(process.cwd(), ".env.local");
const env = {};

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) {
      env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

const tables = [
  "users",
  "sessions",
  "orders",
  "wallet_transactions",
  "payment_deposits",
  "support_tickets",
  "support_messages",
];

const escapeSql = (value) => {
  if (value === null || value === undefined) return "NULL";
  if (value instanceof Date) return `'${value.toISOString().replaceAll("'", "''")}'`;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "object") return `'${JSON.stringify(value).replaceAll("'", "''")}'`;
  return `'${String(value).replaceAll("'", "''")}'`;
};

const outputPath = join(process.cwd(), "cloudflare-d1-data.sql");

const connection = await mysql.createConnection({
  host: env.MYSQL_HOST || "127.0.0.1",
  port: Number(env.MYSQL_PORT || 3306),
  user: env.MYSQL_USER || "root",
  password: env.MYSQL_PASSWORD || "",
  database: env.MYSQL_DATABASE || "boster_bost",
  dateStrings: true,
  decimalNumbers: true,
});

const statements = ["PRAGMA foreign_keys = OFF;"];

for (const table of tables) {
  const [rows] = await connection.query(`SELECT * FROM \`${table}\``);
  if (!rows.length) continue;

  const columns = Object.keys(rows[0]);
  const columnList = columns.map((column) => `"${column}"`).join(", ");
  for (const row of rows) {
    const values = columns.map((column) => escapeSql(row[column])).join(", ");
    statements.push(`INSERT OR REPLACE INTO "${table}" (${columnList}) VALUES (${values});`);
  }
}

statements.push("PRAGMA foreign_keys = ON;");

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${statements.join("\n")}\n`);
await connection.end();

console.log(`Exported D1 import file: ${outputPath}`);
