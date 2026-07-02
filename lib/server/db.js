import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const dbPath = join(process.cwd(), "data", "boster-bost.sqlite");
const mysqlDatabase = process.env.MYSQL_DATABASE || "boster_bost";
const databaseProvider = process.env.DATABASE_PROVIDER || "";
const isCloudflareD1Enabled = databaseProvider === "cloudflare-d1";
const isMysqlEnabled = !isCloudflareD1Enabled && (databaseProvider === "mysql" || Boolean(process.env.MYSQL_HOST || process.env.MYSQL_DATABASE));
const isCloudEnabled = !isMysqlEnabled && !isCloudflareD1Enabled && Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const OWNER_ACCESS = "owner";
const CUSTOMER_ACCESS = "customer";
const ADMIN_ACCESS_LEVELS = new Set(["support", "orders", "finance", "manager", OWNER_ACCESS]);

let database;
let mysqlPool;
let mysqlSchemaReady = false;

const getLocalDatabaseSync = () => {
  const sqlite = process.getBuiltinModule?.("node:sqlite");
  if (!sqlite?.DatabaseSync) {
    throw new Error("Local SQLite is unavailable in this runtime. Set DATABASE_PROVIDER=cloudflare-d1 for the cloud deployment.");
  }
  return sqlite.DatabaseSync;
};

const cloudUrl = () => process.env.SUPABASE_URL.replace(/\/$/, "");
const cloudHeaders = (extra = {}) => ({
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  "content-type": "application/json",
  ...extra,
});

const cloudRequest = async (path, options = {}) => {
  const response = await fetch(`${cloudUrl()}/rest/v1/${path}`, {
    ...options,
    headers: cloudHeaders(options.headers),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.message || data?.hint || `Supabase request failed: ${response.status}`);
  }

  return data;
};

const d1ApiUrl = () =>
  `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${process.env.CLOUDFLARE_D1_DATABASE_ID}/query`;

let d1BindingPromise;

const getD1Binding = async () => {
  if (d1BindingPromise) return d1BindingPromise;

  d1BindingPromise = (async () => {
    try {
      const { getCloudflareContext } = await import("@opennextjs/cloudflare");
      const context = await getCloudflareContext({ async: true });
      return context?.env?.boster_bost || null;
    } catch {
      return null;
    }
  })();

  return d1BindingPromise;
};

const d1Query = async (sql, params = []) => {
  const binding = await getD1Binding();
  if (binding) {
    const statement = binding.prepare(sql).bind(...params);
    if (/^\s*(select|pragma|with)\b/i.test(sql)) {
      const result = await statement.all();
      return result?.results || [];
    }

    await statement.run();
    return [];
  }

  if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_D1_DATABASE_ID || !process.env.CLOUDFLARE_D1_API_TOKEN) {
    throw new Error("Cloudflare D1 is not configured. Add CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, and CLOUDFLARE_D1_API_TOKEN.");
  }

  const response = await fetch(d1ApiUrl(), {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.CLOUDFLARE_D1_API_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.success === false || data.result?.[0]?.success === false) {
    const message = data.errors?.[0]?.message || data.result?.[0]?.error || `Cloudflare D1 request failed: ${response.status}`;
    throw new Error(message);
  }

  return data.result?.[0]?.results || [];
};

const d1Batch = async (batch) => {
  const binding = await getD1Binding();
  if (binding) {
    const statements = batch.map((statement) => binding.prepare(statement.sql).bind(...(statement.params || [])));
    const results = await binding.batch(statements);
    return results.map((result) => result?.results || []);
  }

  const results = [];
  for (const statement of batch) {
    results.push(await d1Query(statement.sql, statement.params || []));
  }
  return results;
};

const mysqlIdentifier = (value) => {
  if (!/^[a-zA-Z0-9_]+$/.test(value)) {
    throw new Error("Invalid MySQL database name.");
  }
  return `\`${value}\``;
};

const normalizeAccessLevels = (value) => {
  const rawLevels = Array.isArray(value) ? value : String(value || "").split(",");
  const levels = rawLevels
    .map((level) => String(level || "").trim().toLowerCase())
    .filter((level) => ADMIN_ACCESS_LEVELS.has(level));

  return [...new Set(levels)];
};

const accessLevelsForUser = (user) => {
  if (!user) return [];
  const levels = normalizeAccessLevels(user.accessLevels || user.access_level || user.accessLevel);
  if (levels.length) return levels;
  return user.is_admin ? [OWNER_ACCESS] : [CUSTOMER_ACCESS];
};

const accessLevelStorageValue = (levels, isAdmin) => {
  if (!isAdmin) return CUSTOMER_ACCESS;
  const normalized = normalizeAccessLevels(levels);
  return (normalized.length ? normalized : ["manager"]).join(",");
};

const getMysqlConnectionOptions = (includeDatabase = true) => ({
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  ...(includeDatabase ? { database: mysqlDatabase } : {}),
  waitForConnections: true,
  connectionLimit: 10,
  charset: "utf8mb4",
  decimalNumbers: true,
  dateStrings: true,
});

const getMysqlPool = async () => {
  if (mysqlPool) return mysqlPool;
  const mysql = await import("mysql2/promise");
  mysqlPool = mysql.createPool(getMysqlConnectionOptions(true));
  return mysqlPool;
};

const withMysqlConnection = async (callback) => {
  await ensureMysqlSchema();
  const pool = await getMysqlPool();
  const connection = await pool.getConnection();
  try {
    return await callback(connection);
  } finally {
    connection.release();
  }
};

const mysqlRows = async (sql, params = []) => {
  await ensureMysqlSchema();
  const pool = await getMysqlPool();
  const [rows] = await pool.execute(sql, params);
  return rows;
};

const ignoreMysqlDuplicate = async (sql) => {
  const pool = await getMysqlPool();
  try {
    await pool.query(sql);
  } catch (error) {
    if (!["ER_DUP_FIELDNAME", "ER_DUP_KEYNAME"].includes(error.code)) {
      throw error;
    }
  }
};

const ignoreMysqlColumn = async (sql) => {
  const pool = await getMysqlPool();
  try {
    await pool.query(sql);
  } catch (error) {
    if (error.code !== "ER_DUP_FIELDNAME") {
      throw error;
    }
  }
};

const ensureMysqlSchema = async () => {
  if (!isMysqlEnabled || mysqlSchemaReady) return;

  const mysql = await import("mysql2/promise");
  const serverConnection = await mysql.createConnection(getMysqlConnectionOptions(false));
  await serverConnection.query(
    `CREATE DATABASE IF NOT EXISTS ${mysqlIdentifier(mysqlDatabase)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await serverConnection.end();

  const pool = await getMysqlPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      email VARCHAR(190) NOT NULL UNIQUE,
      role VARCHAR(40) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      wallet DECIMAL(18,4) NOT NULL DEFAULT 0,
      is_admin TINYINT(1) NOT NULL DEFAULT 0,
      access_level VARCHAR(160) NOT NULL DEFAULT 'customer',
      email_verified TINYINT(1) NOT NULL DEFAULT 0,
      email_verified_at VARCHAR(40),
      verification_token VARCHAR(120),
      password_reset_token VARCHAR(120),
      password_reset_expires_at VARCHAR(40),
      created_at VARCHAR(40) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  await ignoreMysqlColumn("ALTER TABLE users ADD COLUMN access_level VARCHAR(160) NOT NULL DEFAULT 'customer'");
  await pool.query("ALTER TABLE users MODIFY access_level VARCHAR(160) NOT NULL DEFAULT 'customer'");
  await ignoreMysqlColumn("ALTER TABLE users ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0");
  await ignoreMysqlColumn("ALTER TABLE users ADD COLUMN email_verified_at VARCHAR(40)");
  await ignoreMysqlColumn("ALTER TABLE users ADD COLUMN verification_token VARCHAR(120)");
  await ignoreMysqlColumn("ALTER TABLE users ADD COLUMN password_reset_token VARCHAR(120)");
  await ignoreMysqlColumn("ALTER TABLE users ADD COLUMN password_reset_expires_at VARCHAR(40)");
  await pool.query("UPDATE users SET access_level = 'owner' WHERE is_admin = 1 AND (access_level IS NULL OR access_level = 'customer')");
  const [privilegedAdmins] = await pool.query(
    "SELECT COUNT(*) AS count FROM users WHERE is_admin = 1 AND (FIND_IN_SET('owner', REPLACE(access_level, ' ', '')) OR FIND_IN_SET('manager', REPLACE(access_level, ' ', '')))"
  );
  if (Number(privilegedAdmins[0]?.count || 0) === 0) {
    await pool.query("UPDATE users SET access_level = 'owner' WHERE is_admin = 1 ORDER BY created_at ASC LIMIT 1");
  }
  await pool.query("UPDATE users SET email_verified = 1, email_verified_at = COALESCE(email_verified_at, created_at) WHERE is_admin = 1");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      created_at VARCHAR(40) NOT NULL,
      expires_at VARCHAR(40) NOT NULL,
      INDEX idx_sessions_user_id (user_id),
      CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id VARCHAR(64) PRIMARY KEY,
      order_code VARCHAR(40) NOT NULL UNIQUE,
      user_id VARCHAR(64) NOT NULL,
      platform VARCHAR(120) NOT NULL,
      service TEXT NOT NULL,
      package_type VARCHAR(80) NOT NULL,
      quantity INT NOT NULL,
      target_link TEXT NOT NULL,
      delivery_mode VARCHAR(80) NOT NULL,
      notes TEXT,
      rate DECIMAL(18,4) NOT NULL,
      cost DECIMAL(18,4) NOT NULL,
      status VARCHAR(40) NOT NULL,
      created_at VARCHAR(40) NOT NULL,
      updated_at VARCHAR(40),
      INDEX idx_orders_user_id (user_id),
      CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      type VARCHAR(40) NOT NULL,
      amount_rwf DECIMAL(18,4) NOT NULL,
      original_amount DECIMAL(18,4),
      original_currency VARCHAR(10),
      description TEXT,
      created_at VARCHAR(40) NOT NULL,
      INDEX idx_wallet_transactions_user_id (user_id),
      CONSTRAINT fk_wallet_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_deposits (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      provider VARCHAR(40) NOT NULL,
      provider_deposit_id VARCHAR(80) NOT NULL UNIQUE,
      status VARCHAR(40) NOT NULL,
      amount_rwf DECIMAL(18,4) NOT NULL,
      original_amount DECIMAL(18,4) NOT NULL,
      original_currency VARCHAR(10) NOT NULL,
      payer_phone VARCHAR(40),
      payer_provider VARCHAR(80),
      provider_response JSON,
      created_at VARCHAR(40) NOT NULL,
      updated_at VARCHAR(40) NOT NULL,
      INDEX idx_payment_deposits_user_id (user_id),
      CONSTRAINT fk_payment_deposits_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id VARCHAR(64) PRIMARY KEY,
      ticket_code VARCHAR(40) NOT NULL UNIQUE,
      user_id VARCHAR(64) NOT NULL,
      order_id VARCHAR(80),
      subject VARCHAR(220) NOT NULL,
      category VARCHAR(80) NOT NULL,
      status VARCHAR(40) NOT NULL,
      priority VARCHAR(40) NOT NULL,
      created_at VARCHAR(40) NOT NULL,
      updated_at VARCHAR(40),
      INDEX idx_support_tickets_user_id (user_id),
      CONSTRAINT fk_support_tickets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  await ignoreMysqlColumn("ALTER TABLE support_tickets ADD COLUMN order_id VARCHAR(80)");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS support_messages (
      id VARCHAR(64) PRIMARY KEY,
      ticket_id VARCHAR(64) NOT NULL,
      sender_user_id VARCHAR(64) NOT NULL,
      sender_role VARCHAR(20) NOT NULL,
      message TEXT NOT NULL,
      attachment_name VARCHAR(255),
      attachment_type VARCHAR(120),
      attachment_data LONGTEXT,
      created_at VARCHAR(40) NOT NULL,
      INDEX idx_support_messages_ticket_id (ticket_id),
      CONSTRAINT fk_support_messages_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
      CONSTRAINT fk_support_messages_user FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  await ignoreMysqlColumn("ALTER TABLE support_messages ADD COLUMN attachment_name VARCHAR(255)");
  await ignoreMysqlColumn("ALTER TABLE support_messages ADD COLUMN attachment_type VARCHAR(120)");
  await ignoreMysqlColumn("ALTER TABLE support_messages ADD COLUMN attachment_data LONGTEXT");

  mysqlSchemaReady = true;
};

const generateCode = (prefix) => {
  const stamp = Date.now().toString(36).toUpperCase();
  const suffix = randomUUID().slice(0, 4).toUpperCase();
  return `${prefix}-${stamp}-${suffix}`;
};

const toPublicUser = (user) => {
  if (!user) return null;
  const isAdmin = Boolean(user.is_admin);
  const adminAccessLevels = isAdmin ? accessLevelsForUser(user).filter((level) => ADMIN_ACCESS_LEVELS.has(level)) : [];

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    walletRwf: Number(user.wallet || 0),
    wallet: Number(user.wallet || 0),
    isAdmin,
    accessLevel: adminAccessLevels[0] || CUSTOMER_ACCESS,
    accessLevels: adminAccessLevels,
    emailVerified: Boolean(user.email_verified),
    createdAt: user.created_at,
  };
};

export const getDb = () => {
  if (database) return database;
  const DatabaseSync = getLocalDatabaseSync();

  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  database = new DatabaseSync(dbPath);
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      wallet REAL NOT NULL DEFAULT 0,
      access_level TEXT NOT NULL DEFAULT 'customer',
      email_verified INTEGER NOT NULL DEFAULT 0,
      email_verified_at TEXT,
      verification_token TEXT,
      password_reset_token TEXT,
      password_reset_expires_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_code TEXT UNIQUE,
      user_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      service TEXT NOT NULL,
      package_type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      target_link TEXT NOT NULL,
      delivery_mode TEXT NOT NULL,
      notes TEXT,
      rate REAL NOT NULL,
      cost REAL NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount_rwf REAL NOT NULL,
      original_amount REAL,
      original_currency TEXT,
      description TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payment_deposits (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_deposit_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      amount_rwf REAL NOT NULL,
      original_amount REAL NOT NULL,
      original_currency TEXT NOT NULL,
      payer_phone TEXT,
      payer_provider TEXT,
      provider_response TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      ticket_code TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      order_id TEXT,
      subject TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS support_messages (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      sender_user_id TEXT NOT NULL,
      sender_role TEXT NOT NULL,
      message TEXT NOT NULL,
      attachment_name TEXT,
      attachment_type TEXT,
      attachment_data TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  try {
    database.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;");
  } catch {
    // Column already exists.
  }
  try {
    database.exec("ALTER TABLE users ADD COLUMN access_level TEXT NOT NULL DEFAULT 'customer';");
  } catch {
    // Column already exists.
  }
  try {
    database.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;");
  } catch {
    // Column already exists.
  }
  try {
    database.exec("ALTER TABLE users ADD COLUMN email_verified_at TEXT;");
  } catch {
    // Column already exists.
  }
  try {
    database.exec("ALTER TABLE users ADD COLUMN verification_token TEXT;");
  } catch {
    // Column already exists.
  }
  try {
    database.exec("ALTER TABLE users ADD COLUMN password_reset_token TEXT;");
  } catch {
    // Column already exists.
  }
  try {
    database.exec("ALTER TABLE users ADD COLUMN password_reset_expires_at TEXT;");
  } catch {
    // Column already exists.
  }
  database.exec("UPDATE users SET access_level = 'owner' WHERE is_admin = 1 AND (access_level IS NULL OR access_level = 'customer');");
  const privilegedAdminCount = getDb()
    .prepare("SELECT COUNT(*) AS count FROM users WHERE is_admin = 1 AND (access_level LIKE '%owner%' OR access_level LIKE '%manager%')")
    .get().count;
  if (Number(privilegedAdminCount || 0) === 0) {
    getDb().prepare("UPDATE users SET access_level = 'owner' WHERE id = (SELECT id FROM users WHERE is_admin = 1 ORDER BY created_at ASC LIMIT 1)").run();
  }
  database.exec("UPDATE users SET email_verified = 1, email_verified_at = COALESCE(email_verified_at, created_at) WHERE is_admin = 1;");
  try {
    database.exec("ALTER TABLE orders ADD COLUMN order_code TEXT UNIQUE;");
  } catch {
    // Column already exists.
  }
  try {
    database.exec("ALTER TABLE support_tickets ADD COLUMN order_id TEXT;");
  } catch {
    // Column already exists.
  }
  try {
    database.exec("ALTER TABLE support_messages ADD COLUMN attachment_name TEXT;");
  } catch {
    // Column already exists.
  }
  try {
    database.exec("ALTER TABLE support_messages ADD COLUMN attachment_type TEXT;");
  } catch {
    // Column already exists.
  }
  try {
    database.exec("ALTER TABLE support_messages ADD COLUMN attachment_data TEXT;");
  } catch {
    // Column already exists.
  }

  const ordersWithoutCodes = database.prepare("SELECT id FROM orders WHERE order_code IS NULL OR order_code = ''").all();
  ordersWithoutCodes.forEach((order) => {
    database.prepare("UPDATE orders SET order_code = ? WHERE id = ?").run(generateCode("BB"), order.id);
  });

  return database;
};

const hashPassword = (password, salt = randomUUID()) => {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
};

const verifyPassword = (password, storedHash) => {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;

  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

const hasAnyUsers = async () => {
  if (isMysqlEnabled) {
    const rows = await mysqlRows("SELECT COUNT(*) AS count FROM users");
    return Number(rows[0].count) > 0;
  }
  if (isCloudEnabled) {
    const users = await cloudRequest("users?select=id&limit=1");
    return users.length > 0;
  }
  if (isCloudflareD1Enabled) {
    const rows = await d1Query("SELECT COUNT(*) AS count FROM users");
    return Number(rows[0]?.count || 0) > 0;
  }

  return Number(getDb().prepare("SELECT COUNT(*) AS count FROM users").get().count) > 0;
};

const hasAnyAdmins = async () => {
  if (isMysqlEnabled) {
    const rows = await mysqlRows("SELECT COUNT(*) AS count FROM users WHERE is_admin = 1");
    return Number(rows[0].count) > 0;
  }
  if (isCloudEnabled) {
    const admins = await cloudRequest("users?is_admin=eq.true&select=id&limit=1");
    return admins.length > 0;
  }
  if (isCloudflareD1Enabled) {
    const rows = await d1Query("SELECT COUNT(*) AS count FROM users WHERE is_admin = 1");
    return Number(rows[0]?.count || 0) > 0;
  }

  return Number(getDb().prepare("SELECT COUNT(*) AS count FROM users WHERE is_admin = 1").get().count) > 0;
};

export const createUser = async ({ name, email, role, password }) => {
  const cleanEmail = email.trim().toLowerCase();
  const isAdmin = !(await hasAnyUsers()) || !(await hasAnyAdmins());
  const verificationToken = randomUUID();
  const user = {
    id: randomUUID(),
    name: name.trim(),
    email: cleanEmail,
    role,
    password_hash: hashPassword(password),
    wallet: 0,
    is_admin: isAdmin,
    access_level: isAdmin ? OWNER_ACCESS : CUSTOMER_ACCESS,
    email_verified: false,
    email_verified_at: null,
    verification_token: verificationToken,
    created_at: new Date().toISOString(),
  };

  if (isMysqlEnabled) {
    await mysqlRows(
      `INSERT INTO users (
        id, name, email, role, password_hash, wallet, is_admin, access_level,
        email_verified, email_verified_at, verification_token, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.name,
        user.email,
        user.role,
        user.password_hash,
        user.wallet,
        user.is_admin ? 1 : 0,
        user.access_level,
        user.email_verified ? 1 : 0,
        user.email_verified_at,
        user.verification_token,
        user.created_at,
      ]
    );
    return { ...toPublicUser(user), verificationToken };
  }

  if (isCloudEnabled) {
    const [createdUser] = await cloudRequest("users", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(user),
    });
    return { ...toPublicUser(createdUser), verificationToken };
  }

  if (isCloudflareD1Enabled) {
    await d1Query(
      `INSERT INTO users (
        id, name, email, role, password_hash, wallet, is_admin, access_level,
        email_verified, email_verified_at, verification_token, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.name,
        user.email,
        user.role,
        user.password_hash,
        user.wallet,
        user.is_admin ? 1 : 0,
        user.access_level,
        user.email_verified ? 1 : 0,
        user.email_verified_at,
        user.verification_token,
        user.created_at,
      ]
    );
    return { ...toPublicUser(user), verificationToken };
  }

  getDb()
    .prepare(
      `INSERT INTO users (
        id, name, email, role, password_hash, wallet, is_admin, access_level,
        email_verified, email_verified_at, verification_token, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      user.id,
      user.name,
      user.email,
      user.role,
      user.password_hash,
      user.wallet,
      user.is_admin ? 1 : 0,
      user.access_level,
      user.email_verified ? 1 : 0,
      user.email_verified_at,
      user.verification_token,
      user.created_at
    );

  return { ...toPublicUser(user), verificationToken };
};

export const findOrCreateOAuthUser = async ({ name, email, provider = "Google" }) => {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanName = String(name || "").trim() || cleanEmail.split("@")[0] || `${provider} User`;
  if (!cleanEmail) return null;

  const existingUser = isMysqlEnabled
    ? (await mysqlRows("SELECT * FROM users WHERE email = ? LIMIT 1", [cleanEmail]))[0]
    : isCloudEnabled
      ? (await cloudRequest(`users?email=eq.${encodeURIComponent(cleanEmail)}&select=*&limit=1`))[0]
      : isCloudflareD1Enabled
        ? (await d1Query("SELECT * FROM users WHERE email = ? LIMIT 1", [cleanEmail]))[0]
        : getDb().prepare("SELECT * FROM users WHERE email = ?").get(cleanEmail);

  if (existingUser) {
    const verifiedAt = existingUser.email_verified ? existingUser.email_verified_at : new Date().toISOString();
    if (!existingUser.email_verified) {
      if (isMysqlEnabled) {
        await mysqlRows("UPDATE users SET email_verified = 1, email_verified_at = ?, verification_token = NULL WHERE id = ?", [verifiedAt, existingUser.id]);
      } else if (isCloudEnabled) {
        await cloudRequest(`users?id=eq.${encodeURIComponent(existingUser.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ email_verified: true, email_verified_at: verifiedAt, verification_token: null }),
        });
      } else if (isCloudflareD1Enabled) {
        await d1Query("UPDATE users SET email_verified = 1, email_verified_at = ?, verification_token = NULL WHERE id = ?", [verifiedAt, existingUser.id]);
      } else {
        getDb().prepare("UPDATE users SET email_verified = 1, email_verified_at = ?, verification_token = NULL WHERE id = ?").run(verifiedAt, existingUser.id);
      }
      return { ...toPublicUser(existingUser), emailVerified: true, emailVerifiedAt: verifiedAt };
    }
    return toPublicUser(existingUser);
  }

  const isAdmin = !(await hasAnyUsers()) || !(await hasAnyAdmins());
  const verifiedAt = new Date().toISOString();
  const user = {
    id: randomUUID(),
    name: cleanName,
    email: cleanEmail,
    role: "Influencer",
    password_hash: hashPassword(randomUUID()),
    wallet: 0,
    is_admin: isAdmin,
    access_level: isAdmin ? OWNER_ACCESS : CUSTOMER_ACCESS,
    email_verified: true,
    email_verified_at: verifiedAt,
    verification_token: null,
    created_at: verifiedAt,
  };

  if (isMysqlEnabled) {
    await mysqlRows(
      `INSERT INTO users (
        id, name, email, role, password_hash, wallet, is_admin, access_level,
        email_verified, email_verified_at, verification_token, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.name,
        user.email,
        user.role,
        user.password_hash,
        user.wallet,
        user.is_admin ? 1 : 0,
        user.access_level,
        1,
        user.email_verified_at,
        user.verification_token,
        user.created_at,
      ]
    );
    return toPublicUser(user);
  }

  if (isCloudEnabled) {
    const [createdUser] = await cloudRequest("users", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(user),
    });
    return toPublicUser(createdUser);
  }

  if (isCloudflareD1Enabled) {
    await d1Query(
      `INSERT INTO users (
        id, name, email, role, password_hash, wallet, is_admin, access_level,
        email_verified, email_verified_at, verification_token, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.name,
        user.email,
        user.role,
        user.password_hash,
        user.wallet,
        user.is_admin ? 1 : 0,
        user.access_level,
        1,
        user.email_verified_at,
        user.verification_token,
        user.created_at,
      ]
    );
    return toPublicUser(user);
  }

  getDb()
    .prepare(
      `INSERT INTO users (
        id, name, email, role, password_hash, wallet, is_admin, access_level,
        email_verified, email_verified_at, verification_token, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      user.id,
      user.name,
      user.email,
      user.role,
      user.password_hash,
      user.wallet,
      user.is_admin ? 1 : 0,
      user.access_level,
      1,
      user.email_verified_at,
      user.verification_token,
      user.created_at
    );

  return toPublicUser(user);
};

export const authenticateUser = async ({ email, password }) => {
  const cleanEmail = email.trim().toLowerCase();
  const user = isMysqlEnabled
    ? (await mysqlRows("SELECT * FROM users WHERE email = ? LIMIT 1", [cleanEmail]))[0]
    : isCloudEnabled
      ? (await cloudRequest(`users?email=eq.${encodeURIComponent(cleanEmail)}&select=*&limit=1`))[0]
      : isCloudflareD1Enabled
        ? (await d1Query("SELECT * FROM users WHERE email = ? LIMIT 1", [cleanEmail]))[0]
        : getDb().prepare("SELECT * FROM users WHERE email = ?").get(cleanEmail);

  if (!user || !verifyPassword(password, user.password_hash)) {
    return null;
  }

  return toPublicUser(user);
};

export const verifyEmailToken = async (token) => {
  const cleanToken = String(token || "").trim();
  if (!cleanToken) return null;

  const verifiedAt = new Date().toISOString();

  if (isMysqlEnabled) {
    const rows = await mysqlRows("SELECT * FROM users WHERE verification_token = ? LIMIT 1", [cleanToken]);
    const user = rows[0];
    if (!user) return null;
    await mysqlRows("UPDATE users SET email_verified = 1, email_verified_at = ?, verification_token = NULL WHERE id = ?", [verifiedAt, user.id]);
    const updated = (await mysqlRows("SELECT * FROM users WHERE id = ? LIMIT 1", [user.id]))[0];
    return toPublicUser(updated);
  }

  if (isCloudEnabled) {
    const [user] = await cloudRequest(`users?verification_token=eq.${encodeURIComponent(cleanToken)}&select=*&limit=1`);
    if (!user) return null;
    const [updated] = await cloudRequest(`users?id=eq.${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ email_verified: true, email_verified_at: verifiedAt, verification_token: null }),
    });
    return toPublicUser(updated);
  }

  if (isCloudflareD1Enabled) {
    const user = (await d1Query("SELECT * FROM users WHERE verification_token = ? LIMIT 1", [cleanToken]))[0];
    if (!user) return null;
    await d1Query("UPDATE users SET email_verified = 1, email_verified_at = ?, verification_token = NULL WHERE id = ?", [verifiedAt, user.id]);
    const updated = (await d1Query("SELECT * FROM users WHERE id = ? LIMIT 1", [user.id]))[0];
    return toPublicUser(updated);
  }

  const user = getDb().prepare("SELECT * FROM users WHERE verification_token = ?").get(cleanToken);
  if (!user) return null;
  getDb().prepare("UPDATE users SET email_verified = 1, email_verified_at = ?, verification_token = NULL WHERE id = ?").run(verifiedAt, user.id);
  return toPublicUser(getDb().prepare("SELECT * FROM users WHERE id = ?").get(user.id));
};

export const createPasswordResetToken = async (email) => {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail) return null;

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60).toISOString();

  if (isMysqlEnabled) {
    const rows = await mysqlRows("SELECT id, name, email FROM users WHERE email = ? LIMIT 1", [cleanEmail]);
    const user = rows[0];
    if (!user) return null;
    await mysqlRows("UPDATE users SET password_reset_token = ?, password_reset_expires_at = ? WHERE id = ?", [token, expiresAt, user.id]);
    return { user: toPublicUser(user), token, expiresAt };
  }

  if (isCloudEnabled) {
    const [user] = await cloudRequest(`users?email=eq.${encodeURIComponent(cleanEmail)}&select=id,name,email,role,wallet,is_admin,access_level,email_verified,created_at&limit=1`);
    if (!user) return null;
    await cloudRequest(`users?id=eq.${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ password_reset_token: token, password_reset_expires_at: expiresAt }),
    });
    return { user: toPublicUser(user), token, expiresAt };
  }

  if (isCloudflareD1Enabled) {
    const user = (await d1Query("SELECT * FROM users WHERE email = ? LIMIT 1", [cleanEmail]))[0];
    if (!user) return null;
    await d1Query("UPDATE users SET password_reset_token = ?, password_reset_expires_at = ? WHERE id = ?", [token, expiresAt, user.id]);
    return { user: toPublicUser(user), token, expiresAt };
  }

  const user = getDb().prepare("SELECT * FROM users WHERE email = ?").get(cleanEmail);
  if (!user) return null;
  getDb().prepare("UPDATE users SET password_reset_token = ?, password_reset_expires_at = ? WHERE id = ?").run(token, expiresAt, user.id);
  return { user: toPublicUser(user), token, expiresAt };
};

export const resetPasswordWithToken = async ({ token, password }) => {
  const cleanToken = String(token || "").trim();
  if (!cleanToken || String(password || "").length < 6) return null;

  const now = new Date().toISOString();
  const passwordHash = hashPassword(password);

  if (isMysqlEnabled) {
    const rows = await mysqlRows("SELECT * FROM users WHERE password_reset_token = ? AND password_reset_expires_at > ? LIMIT 1", [cleanToken, now]);
    const user = rows[0];
    if (!user) return null;
    await mysqlRows("UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_expires_at = NULL WHERE id = ?", [passwordHash, user.id]);
    return toPublicUser(user);
  }

  if (isCloudEnabled) {
    const [user] = await cloudRequest(
      `users?password_reset_token=eq.${encodeURIComponent(cleanToken)}&password_reset_expires_at=gt.${encodeURIComponent(now)}&select=*&limit=1`
    );
    if (!user) return null;
    await cloudRequest(`users?id=eq.${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ password_hash: passwordHash, password_reset_token: null, password_reset_expires_at: null }),
    });
    return toPublicUser(user);
  }

  if (isCloudflareD1Enabled) {
    const user = (await d1Query("SELECT * FROM users WHERE password_reset_token = ? AND password_reset_expires_at > ? LIMIT 1", [cleanToken, now]))[0];
    if (!user) return null;
    await d1Query("UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_expires_at = NULL WHERE id = ?", [passwordHash, user.id]);
    return toPublicUser(user);
  }

  const user = getDb()
    .prepare("SELECT * FROM users WHERE password_reset_token = ? AND password_reset_expires_at > ?")
    .get(cleanToken, now);
  if (!user) return null;
  getDb()
    .prepare("UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_expires_at = NULL WHERE id = ?")
    .run(passwordHash, user.id);
  return toPublicUser(user);
};

export const hasAdminAccess = (user, allowedLevels = [...ADMIN_ACCESS_LEVELS]) => {
  if (!user?.isAdmin) return false;
  const allowed = new Set(allowedLevels);
  return accessLevelsForUser(user).some((level) => allowed.has(level));
};

export const createSession = async (userId) => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 180);
  const session = {
    id: randomUUID(),
    user_id: userId,
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  };

  if (isMysqlEnabled) {
    await mysqlRows("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)", [
      session.id,
      session.user_id,
      session.created_at,
      session.expires_at,
    ]);
  } else if (isCloudEnabled) {
    await cloudRequest("sessions", {
      method: "POST",
      body: JSON.stringify(session),
    });
  } else if (isCloudflareD1Enabled) {
    await d1Query("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)", [
      session.id,
      session.user_id,
      session.created_at,
      session.expires_at,
    ]);
  } else {
    getDb().prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
      session.id,
      session.user_id,
      session.created_at,
      session.expires_at
    );
  }

  return { sessionId: session.id, expiresAt };
};

export const deleteSession = async (sessionId) => {
  if (!sessionId) return;

  if (isMysqlEnabled) {
    await mysqlRows("DELETE FROM sessions WHERE id = ?", [sessionId]);
    return;
  }

  if (isCloudEnabled) {
    await cloudRequest(`sessions?id=eq.${encodeURIComponent(sessionId)}`, { method: "DELETE" });
    return;
  }

  if (isCloudflareD1Enabled) {
    await d1Query("DELETE FROM sessions WHERE id = ?", [sessionId]);
    return;
  }

  getDb().prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
};

export const getUserBySession = async (sessionId) => {
  if (!sessionId) return null;

  if (isMysqlEnabled) {
    const rows = await mysqlRows(
      `SELECT users.*
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.id = ? AND sessions.expires_at > ?
       LIMIT 1`,
      [sessionId, new Date().toISOString()]
    );
    return toPublicUser(rows[0]);
  }

  if (isCloudEnabled) {
    const [session] = await cloudRequest(
      `sessions?id=eq.${encodeURIComponent(sessionId)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id&limit=1`
    );
    if (!session) return null;
    const [user] = await cloudRequest(`users?id=eq.${encodeURIComponent(session.user_id)}&select=*&limit=1`);
    return toPublicUser(user);
  }

  if (isCloudflareD1Enabled) {
    const row = (
      await d1Query(
        `SELECT users.*
         FROM sessions
         JOIN users ON users.id = sessions.user_id
         WHERE sessions.id = ? AND sessions.expires_at > ?
         LIMIT 1`,
        [sessionId, new Date().toISOString()]
      )
    )[0];
    return toPublicUser(row);
  }

  const row = getDb()
    .prepare(
      `SELECT users.*
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.id = ? AND sessions.expires_at > ?`
    )
    .get(sessionId, new Date().toISOString());

  return toPublicUser(row);
};

export const createOrder = async (userId, order) => {
  const newOrder = {
    id: randomUUID(),
    order_code: generateCode("BB"),
    user_id: userId,
    platform: order.platform,
    service: order.service,
    package_type: order.packageType,
    quantity: Number(order.quantity),
    target_link: order.targetLink,
    delivery_mode: order.deliveryMode,
    notes: order.notes || "",
    rate: Number(order.rate),
    cost: Number(order.cost),
    status: "Pending Review",
    created_at: new Date().toISOString(),
    updated_at: null,
  };

  if (isMysqlEnabled) {
    return withMysqlConnection(async (connection) => {
      await connection.beginTransaction();
      try {
        const [users] = await connection.execute("SELECT wallet FROM users WHERE id = ? FOR UPDATE", [userId]);
        const currentUser = users[0];
        if (!currentUser || Number(currentUser.wallet || 0) < newOrder.cost) {
          throw new Error("Insufficient wallet balance. Please add funds before placing this order.");
        }
        await connection.execute("UPDATE users SET wallet = wallet - ? WHERE id = ?", [newOrder.cost, userId]);
        await connection.execute(
          `INSERT INTO orders (
            id, order_code, user_id, platform, service, package_type, quantity, target_link, delivery_mode,
            notes, rate, cost, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newOrder.id,
            newOrder.order_code,
            newOrder.user_id,
            newOrder.platform,
            newOrder.service,
            newOrder.package_type,
            newOrder.quantity,
            newOrder.target_link,
            newOrder.delivery_mode,
            newOrder.notes,
            newOrder.rate,
            newOrder.cost,
            newOrder.status,
            newOrder.created_at,
            newOrder.updated_at,
          ]
        );
        await connection.execute(
          `INSERT INTO wallet_transactions (id, user_id, type, amount_rwf, original_amount, original_currency, description, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            randomUUID(),
            userId,
            "order",
            -newOrder.cost,
            newOrder.cost,
            "RWF",
            `${newOrder.platform} - ${newOrder.service}`,
            new Date().toISOString(),
          ]
        );
        await connection.commit();
        return mapOrder(newOrder);
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    });
  }

  if (isCloudEnabled) {
    const [user] = await cloudRequest(`users?id=eq.${encodeURIComponent(userId)}&select=wallet&limit=1`);
    if (!user || Number(user.wallet || 0) < newOrder.cost) {
      throw new Error("Insufficient wallet balance. Please add funds before placing this order.");
    }
    const newWallet = Number(user.wallet || 0) - newOrder.cost;
    await cloudRequest(`users?id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: JSON.stringify({ wallet: newWallet }),
    });
    const [createdOrder] = await cloudRequest("orders", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(newOrder),
    });
    await cloudRequest("wallet_transactions", {
      method: "POST",
      body: JSON.stringify({
        id: randomUUID(),
        user_id: userId,
        type: "order",
        amount_rwf: -newOrder.cost,
        original_amount: newOrder.cost,
        original_currency: "RWF",
        description: `${newOrder.platform} - ${newOrder.service}`,
        created_at: new Date().toISOString(),
      }),
    });
    return mapOrder(createdOrder);
  }

  if (isCloudflareD1Enabled) {
    const user = (await d1Query("SELECT wallet FROM users WHERE id = ? LIMIT 1", [userId]))[0];
    if (!user || Number(user.wallet || 0) < newOrder.cost) {
      throw new Error("Insufficient wallet balance. Please add funds before placing this order.");
    }
    await d1Batch([
      { sql: "UPDATE users SET wallet = wallet - ? WHERE id = ?", params: [newOrder.cost, userId] },
      {
        sql: `INSERT INTO orders (
          id, order_code, user_id, platform, service, package_type, quantity, target_link, delivery_mode,
          notes, rate, cost, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          newOrder.id,
          newOrder.order_code,
          newOrder.user_id,
          newOrder.platform,
          newOrder.service,
          newOrder.package_type,
          newOrder.quantity,
          newOrder.target_link,
          newOrder.delivery_mode,
          newOrder.notes,
          newOrder.rate,
          newOrder.cost,
          newOrder.status,
          newOrder.created_at,
          newOrder.updated_at,
        ],
      },
      {
        sql: `INSERT INTO wallet_transactions (id, user_id, type, amount_rwf, original_amount, original_currency, description, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [randomUUID(), userId, "order", -newOrder.cost, newOrder.cost, "RWF", `${newOrder.platform} - ${newOrder.service}`, new Date().toISOString()],
      },
    ]);
    return mapOrder(newOrder);
  }

  const db = getDb();
  const currentUser = db.prepare("SELECT wallet FROM users WHERE id = ?").get(userId);
  if (!currentUser || Number(currentUser.wallet || 0) < newOrder.cost) {
    throw new Error("Insufficient wallet balance. Please add funds before placing this order.");
  }

  db.exec("BEGIN TRANSACTION;");
  try {
    db.prepare("UPDATE users SET wallet = wallet - ? WHERE id = ?").run(newOrder.cost, userId);
    db.prepare(
      `INSERT INTO orders (
        id, order_code, user_id, platform, service, package_type, quantity, target_link, delivery_mode,
        notes, rate, cost, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      newOrder.id,
      newOrder.order_code,
      newOrder.user_id,
      newOrder.platform,
      newOrder.service,
      newOrder.package_type,
      newOrder.quantity,
      newOrder.target_link,
      newOrder.delivery_mode,
      newOrder.notes,
      newOrder.rate,
      newOrder.cost,
      newOrder.status,
      newOrder.created_at,
      newOrder.updated_at
    );
    db.prepare(
      `INSERT INTO wallet_transactions (id, user_id, type, amount_rwf, original_amount, original_currency, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      randomUUID(),
      userId,
      "order",
      -newOrder.cost,
      newOrder.cost,
      "RWF",
      `${newOrder.platform} - ${newOrder.service}`,
      new Date().toISOString()
    );
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }

  return mapOrder({ ...newOrder });
};

const mapOrder = (order) => ({
  id: order.id,
  orderId: order.order_code || order.orderCode || order.id?.slice(0, 8),
  userId: order.user_id,
  customerName: order.customer_name,
  customerEmail: order.customer_email,
  platform: order.platform,
  service: order.service,
  packageType: order.package_type,
  quantity: Number(order.quantity),
  targetLink: order.target_link,
  deliveryMode: order.delivery_mode,
  notes: order.notes || "",
  rate: Number(order.rate),
  cost: Number(order.cost),
  status: order.status,
  createdAt: order.created_at,
  updatedAt: order.updated_at,
});

export const listOrdersForUser = async (userId) => {
  if (isMysqlEnabled) {
    const orders = await mysqlRows(
      `SELECT orders.*, users.name AS customer_name, users.email AS customer_email
       FROM orders
       JOIN users ON users.id = orders.user_id
       WHERE orders.user_id = ?
       ORDER BY orders.created_at DESC`,
      [userId]
    );
    return orders.map(mapOrder);
  }

  if (isCloudEnabled) {
    const orders = await cloudRequest(
      `orders?user_id=eq.${encodeURIComponent(userId)}&select=*,users(name,email)&order=created_at.desc`
    );
    return orders.map((order) =>
      mapOrder({
        ...order,
        customer_name: order.users?.name,
        customer_email: order.users?.email,
      })
    );
  }

  if (isCloudflareD1Enabled) {
    const orders = await d1Query(
      `SELECT orders.*, users.name AS customer_name, users.email AS customer_email
       FROM orders
       JOIN users ON users.id = orders.user_id
       WHERE orders.user_id = ?
       ORDER BY orders.created_at DESC`,
      [userId]
    );
    return orders.map(mapOrder);
  }

  return getDb()
    .prepare(
      `SELECT orders.*, users.name AS customer_name, users.email AS customer_email
       FROM orders
       JOIN users ON users.id = orders.user_id
       WHERE orders.user_id = ?
       ORDER BY orders.created_at DESC`
    )
    .all(userId)
    .map(mapOrder);
};

export const listAllOrders = async () => {
  if (isMysqlEnabled) {
    const orders = await mysqlRows(
      `SELECT orders.*, users.name AS customer_name, users.email AS customer_email
       FROM orders
       JOIN users ON users.id = orders.user_id
       ORDER BY orders.created_at DESC`
    );
    return orders.map(mapOrder);
  }

  if (isCloudEnabled) {
    const orders = await cloudRequest("orders?select=*,users(name,email)&order=created_at.desc");
    return orders.map((order) =>
      mapOrder({
        ...order,
        customer_name: order.users?.name,
        customer_email: order.users?.email,
      })
    );
  }

  if (isCloudflareD1Enabled) {
    const orders = await d1Query(
      `SELECT orders.*, users.name AS customer_name, users.email AS customer_email
       FROM orders
       JOIN users ON users.id = orders.user_id
       ORDER BY orders.created_at DESC`
    );
    return orders.map(mapOrder);
  }

  return getDb()
    .prepare(
      `SELECT orders.*, users.name AS customer_name, users.email AS customer_email
       FROM orders
       JOIN users ON users.id = orders.user_id
       ORDER BY orders.created_at DESC`
    )
    .all()
    .map(mapOrder);
};

export const getAdminDashboardStats = async () => {
  if (isMysqlEnabled) {
    const [users, orders, pending, openSupport, walletRecords] = await Promise.all([
      mysqlRows("SELECT COUNT(*) AS count FROM users"),
      mysqlRows("SELECT COUNT(*) AS count FROM orders"),
      mysqlRows("SELECT COUNT(*) AS count FROM orders WHERE status = 'Pending Review'"),
      mysqlRows("SELECT COUNT(*) AS count FROM support_tickets WHERE status <> 'Closed'"),
      mysqlRows("SELECT COUNT(*) AS count FROM wallet_transactions"),
    ]);
    return {
      totalUsers: Number(users[0]?.count || 0),
      orderRequests: Number(orders[0]?.count || 0),
      pendingReview: Number(pending[0]?.count || 0),
      openSupport: Number(openSupport[0]?.count || 0),
      walletRecords: Number(walletRecords[0]?.count || 0),
    };
  }

  if (isCloudEnabled) {
    const [users, orders, tickets, walletTransactions] = await Promise.all([
      cloudRequest("users?select=id"),
      cloudRequest("orders?select=id,status"),
      cloudRequest("support_tickets?select=id,status"),
      cloudRequest("wallet_transactions?select=id"),
    ]);
    return {
      totalUsers: users.length,
      orderRequests: orders.length,
      pendingReview: orders.filter((order) => order.status === "Pending Review").length,
      openSupport: tickets.filter((ticket) => ticket.status !== "Closed").length,
      walletRecords: walletTransactions.length,
    };
  }

  if (isCloudflareD1Enabled) {
    const [users, orders, pending, openSupport, walletRecords] = await Promise.all([
      d1Query("SELECT COUNT(*) AS count FROM users"),
      d1Query("SELECT COUNT(*) AS count FROM orders"),
      d1Query("SELECT COUNT(*) AS count FROM orders WHERE status = 'Pending Review'"),
      d1Query("SELECT COUNT(*) AS count FROM support_tickets WHERE status <> 'Closed'"),
      d1Query("SELECT COUNT(*) AS count FROM wallet_transactions"),
    ]);
    return {
      totalUsers: Number(users[0]?.count || 0),
      orderRequests: Number(orders[0]?.count || 0),
      pendingReview: Number(pending[0]?.count || 0),
      openSupport: Number(openSupport[0]?.count || 0),
      walletRecords: Number(walletRecords[0]?.count || 0),
    };
  }

  const db = getDb();
  return {
    totalUsers: Number(db.prepare("SELECT COUNT(*) AS count FROM users").get().count || 0),
    orderRequests: Number(db.prepare("SELECT COUNT(*) AS count FROM orders").get().count || 0),
    pendingReview: Number(db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status = 'Pending Review'").get().count || 0),
    openSupport: Number(db.prepare("SELECT COUNT(*) AS count FROM support_tickets WHERE status <> 'Closed'").get().count || 0),
    walletRecords: Number(db.prepare("SELECT COUNT(*) AS count FROM wallet_transactions").get().count || 0),
  };
};

export const listUsersWithOrderCounts = async () => {
  if (isMysqlEnabled) {
    const users = await mysqlRows(
      `SELECT users.id, users.name, users.email, users.role, users.wallet, users.is_admin, users.access_level,
              users.email_verified, users.email_verified_at, users.created_at, COUNT(orders.id) AS order_count
       FROM users
       LEFT JOIN orders ON orders.user_id = users.id
       GROUP BY users.id, users.name, users.email, users.role, users.wallet, users.is_admin,
                users.access_level, users.email_verified, users.email_verified_at, users.created_at
       ORDER BY users.created_at DESC`
    );
    return users.map((user) => ({
      ...toPublicUser(user),
      orderCount: Number(user.order_count || 0),
    }));
  }

  if (isCloudEnabled) {
    const [users, orders] = await Promise.all([
      cloudRequest("users?select=id,name,email,role,wallet,is_admin,access_level,email_verified,email_verified_at,created_at&order=created_at.desc"),
      cloudRequest("orders?select=id,user_id"),
    ]);
    return users.map((user) => ({
      ...toPublicUser(user),
      orderCount: orders.filter((order) => order.user_id === user.id).length,
    }));
  }

  if (isCloudflareD1Enabled) {
    const users = await d1Query(
      `SELECT users.id, users.name, users.email, users.role, users.wallet, users.is_admin, users.access_level,
              users.email_verified, users.email_verified_at, users.created_at, COUNT(orders.id) AS order_count
       FROM users
       LEFT JOIN orders ON orders.user_id = users.id
       GROUP BY users.id
       ORDER BY users.created_at DESC`
    );
    return users.map((user) => ({
      ...toPublicUser(user),
      orderCount: Number(user.order_count || 0),
    }));
  }

  return getDb()
    .prepare(
      `SELECT users.id, users.name, users.email, users.role, users.wallet, users.is_admin, users.access_level,
              users.email_verified, users.email_verified_at, users.created_at, COUNT(orders.id) AS order_count
       FROM users
       LEFT JOIN orders ON orders.user_id = users.id
       GROUP BY users.id
       ORDER BY users.created_at DESC`
    )
    .all()
    .map((user) => ({
      ...toPublicUser(user),
      orderCount: Number(user.order_count || 0),
    }));
};

export const updateOrderStatus = async (orderId, status) => {
  const updatedAt = new Date().toISOString();

  if (isMysqlEnabled) {
    await mysqlRows("UPDATE orders SET status = ?, updated_at = ? WHERE id = ? OR order_code = ?", [status, updatedAt, orderId, orderId]);
    const rows = await mysqlRows("SELECT * FROM orders WHERE id = ? OR order_code = ? LIMIT 1", [orderId, orderId]);
    return rows[0] || null;
  }

  if (isCloudEnabled) {
    const [order] = await cloudRequest(`orders?id=eq.${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status, updated_at: updatedAt }),
    });
    return order;
  }

  if (isCloudflareD1Enabled) {
    await d1Query("UPDATE orders SET status = ?, updated_at = ? WHERE id = ? OR order_code = ?", [status, updatedAt, orderId, orderId]);
    return (await d1Query("SELECT * FROM orders WHERE id = ? OR order_code = ? LIMIT 1", [orderId, orderId]))[0] || null;
  }

  getDb().prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ? OR order_code = ?").run(status, updatedAt, orderId, orderId);
  return getDb().prepare("SELECT * FROM orders WHERE id = ? OR order_code = ?").get(orderId, orderId);
};

export const updateUserManagement = async (userId, { role, isAdmin, accessLevel, accessLevels }) => {
  const nextAccessLevel = accessLevelStorageValue(accessLevels || accessLevel, isAdmin);

  if (isMysqlEnabled) {
    await mysqlRows("UPDATE users SET role = ?, is_admin = ?, access_level = ? WHERE id = ?", [role, isAdmin ? 1 : 0, nextAccessLevel, userId]);
    const rows = await mysqlRows("SELECT * FROM users WHERE id = ? LIMIT 1", [userId]);
    return toPublicUser(rows[0]);
  }

  if (isCloudEnabled) {
    const [user] = await cloudRequest(`users?id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ role, is_admin: Boolean(isAdmin), access_level: nextAccessLevel }),
    });
    return toPublicUser(user);
  }

  if (isCloudflareD1Enabled) {
    await d1Query("UPDATE users SET role = ?, is_admin = ?, access_level = ? WHERE id = ?", [role, isAdmin ? 1 : 0, nextAccessLevel, userId]);
    const user = (await d1Query("SELECT * FROM users WHERE id = ? LIMIT 1", [userId]))[0];
    return toPublicUser(user);
  }

  getDb().prepare("UPDATE users SET role = ?, is_admin = ?, access_level = ? WHERE id = ?").run(role, isAdmin ? 1 : 0, nextAccessLevel, userId);
  return toPublicUser(getDb().prepare("SELECT * FROM users WHERE id = ?").get(userId));
};

export const backendMode = () => {
  if (isMysqlEnabled) return "xampp-mysql";
  if (isCloudflareD1Enabled) return "cloudflare-d1";
  if (isCloudEnabled) return "cloud-supabase";
  return "local-sqlite";
};

export const cloudBackendEnabled = () => isCloudEnabled || isCloudflareD1Enabled;

const mapWalletTransaction = (transaction) => ({
  id: transaction.id,
  userId: transaction.user_id,
  type: transaction.type,
  amountRwf: Number(transaction.amount_rwf),
  originalAmount: Number(transaction.original_amount || 0),
  originalCurrency: transaction.original_currency,
  description: transaction.description,
  createdAt: transaction.created_at,
});

const mapPaymentDeposit = (deposit) => ({
  id: deposit.id,
  userId: deposit.user_id,
  provider: deposit.provider,
  providerDepositId: deposit.provider_deposit_id,
  status: deposit.status,
  amountRwf: Number(deposit.amount_rwf),
  originalAmount: Number(deposit.original_amount || 0),
  originalCurrency: deposit.original_currency,
  payerPhone: deposit.payer_phone,
  payerProvider: deposit.payer_provider,
  providerResponse:
    typeof deposit.provider_response === "string" && deposit.provider_response
      ? JSON.parse(deposit.provider_response)
      : deposit.provider_response || null,
  createdAt: deposit.created_at,
  updatedAt: deposit.updated_at,
});

export const addWalletFunds = async (userId, { amountRwf, originalAmount, originalCurrency }) => {
  const transaction = {
    id: randomUUID(),
    user_id: userId,
    type: "deposit",
    amount_rwf: Number(amountRwf),
    original_amount: Number(originalAmount),
    original_currency: originalCurrency,
    description: `Wallet deposit in ${originalCurrency}`,
    created_at: new Date().toISOString(),
  };

  if (transaction.amount_rwf <= 0) {
    throw new Error("Funding amount must be greater than zero.");
  }

  if (isMysqlEnabled) {
    return withMysqlConnection(async (connection) => {
      await connection.beginTransaction();
      try {
        await connection.execute("UPDATE users SET wallet = wallet + ? WHERE id = ?", [transaction.amount_rwf, userId]);
        await connection.execute(
          `INSERT INTO wallet_transactions (id, user_id, type, amount_rwf, original_amount, original_currency, description, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            transaction.id,
            transaction.user_id,
            transaction.type,
            transaction.amount_rwf,
            transaction.original_amount,
            transaction.original_currency,
            transaction.description,
            transaction.created_at,
          ]
        );
        const [users] = await connection.execute("SELECT wallet FROM users WHERE id = ? LIMIT 1", [userId]);
        await connection.commit();
        return { walletRwf: Number(users[0].wallet || 0), transaction: mapWalletTransaction(transaction) };
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    });
  }

  if (isCloudEnabled) {
    const [user] = await cloudRequest(`users?id=eq.${encodeURIComponent(userId)}&select=wallet&limit=1`);
    const newWallet = Number(user?.wallet || 0) + transaction.amount_rwf;
    await cloudRequest(`users?id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: JSON.stringify({ wallet: newWallet }),
    });
    await cloudRequest("wallet_transactions", {
      method: "POST",
      body: JSON.stringify(transaction),
    });
    return { walletRwf: newWallet, transaction: mapWalletTransaction(transaction) };
  }

  if (isCloudflareD1Enabled) {
    const user = (await d1Query("SELECT wallet FROM users WHERE id = ? LIMIT 1", [userId]))[0];
    const newWallet = Number(user?.wallet || 0) + transaction.amount_rwf;
    await d1Batch([
      { sql: "UPDATE users SET wallet = ? WHERE id = ?", params: [newWallet, userId] },
      {
        sql: `INSERT INTO wallet_transactions (id, user_id, type, amount_rwf, original_amount, original_currency, description, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          transaction.id,
          transaction.user_id,
          transaction.type,
          transaction.amount_rwf,
          transaction.original_amount,
          transaction.original_currency,
          transaction.description,
          transaction.created_at,
        ],
      },
    ]);
    return { walletRwf: newWallet, transaction: mapWalletTransaction(transaction) };
  }

  const db = getDb();
  db.exec("BEGIN TRANSACTION;");
  try {
    db.prepare("UPDATE users SET wallet = wallet + ? WHERE id = ?").run(transaction.amount_rwf, userId);
    db.prepare(
      `INSERT INTO wallet_transactions (id, user_id, type, amount_rwf, original_amount, original_currency, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      transaction.id,
      transaction.user_id,
      transaction.type,
      transaction.amount_rwf,
      transaction.original_amount,
      transaction.original_currency,
      transaction.description,
      transaction.created_at
    );
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }

  const user = db.prepare("SELECT wallet FROM users WHERE id = ?").get(userId);
  return { walletRwf: Number(user.wallet || 0), transaction: mapWalletTransaction(transaction) };
};

export const createPaymentDeposit = async ({
  userId,
  amountRwf,
  originalAmount,
  originalCurrency,
  payerPhone,
  payerProvider,
  providerResponse = null,
}) => {
  const now = new Date().toISOString();
  const deposit = {
    id: randomUUID(),
    user_id: userId,
    provider: "pawapay",
    provider_deposit_id: randomUUID(),
    status: "PENDING",
    amount_rwf: Number(amountRwf),
    original_amount: Number(originalAmount),
    original_currency: originalCurrency,
    payer_phone: payerPhone || "",
    payer_provider: payerProvider || "",
    provider_response: providerResponse ? JSON.stringify(providerResponse) : null,
    created_at: now,
    updated_at: now,
  };

  if (isMysqlEnabled) {
    await mysqlRows(
      `INSERT INTO payment_deposits (
        id, user_id, provider, provider_deposit_id, status, amount_rwf, original_amount, original_currency,
        payer_phone, payer_provider, provider_response, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        deposit.id,
        deposit.user_id,
        deposit.provider,
        deposit.provider_deposit_id,
        deposit.status,
        deposit.amount_rwf,
        deposit.original_amount,
        deposit.original_currency,
        deposit.payer_phone,
        deposit.payer_provider,
        deposit.provider_response,
        deposit.created_at,
        deposit.updated_at,
      ]
    );
    return mapPaymentDeposit(deposit);
  }

  if (isCloudflareD1Enabled) {
    await d1Query(
      `INSERT INTO payment_deposits (
        id, user_id, provider, provider_deposit_id, status, amount_rwf, original_amount, original_currency,
        payer_phone, payer_provider, provider_response, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        deposit.id,
        deposit.user_id,
        deposit.provider,
        deposit.provider_deposit_id,
        deposit.status,
        deposit.amount_rwf,
        deposit.original_amount,
        deposit.original_currency,
        deposit.payer_phone,
        deposit.payer_provider,
        deposit.provider_response,
        deposit.created_at,
        deposit.updated_at,
      ]
    );
    return mapPaymentDeposit(deposit);
  }

  const db = getDb();
  db.prepare(
    `INSERT INTO payment_deposits (
      id, user_id, provider, provider_deposit_id, status, amount_rwf, original_amount, original_currency,
      payer_phone, payer_provider, provider_response, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    deposit.id,
    deposit.user_id,
    deposit.provider,
    deposit.provider_deposit_id,
    deposit.status,
    deposit.amount_rwf,
    deposit.original_amount,
    deposit.original_currency,
    deposit.payer_phone,
    deposit.payer_provider,
    deposit.provider_response,
    deposit.created_at,
    deposit.updated_at
  );
  return mapPaymentDeposit(deposit);
};

export const updatePaymentDepositStatus = async (providerDepositId, status, providerResponse = null) => {
  const updatedAt = new Date().toISOString();
  const response = providerResponse ? JSON.stringify(providerResponse) : null;

  if (isMysqlEnabled) {
    await mysqlRows("UPDATE payment_deposits SET status = ?, provider_response = COALESCE(?, provider_response), updated_at = ? WHERE provider_deposit_id = ?", [
      status,
      response,
      updatedAt,
      providerDepositId,
    ]);
    const rows = await mysqlRows("SELECT * FROM payment_deposits WHERE provider_deposit_id = ? LIMIT 1", [providerDepositId]);
    return rows[0] ? mapPaymentDeposit(rows[0]) : null;
  }

  if (isCloudflareD1Enabled) {
    await d1Query("UPDATE payment_deposits SET status = ?, provider_response = COALESCE(?, provider_response), updated_at = ? WHERE provider_deposit_id = ?", [
      status,
      response,
      updatedAt,
      providerDepositId,
    ]);
    const deposit = (await d1Query("SELECT * FROM payment_deposits WHERE provider_deposit_id = ? LIMIT 1", [providerDepositId]))[0];
    return deposit ? mapPaymentDeposit(deposit) : null;
  }

  const db = getDb();
  db.prepare("UPDATE payment_deposits SET status = ?, provider_response = COALESCE(?, provider_response), updated_at = ? WHERE provider_deposit_id = ?").run(
    status,
    response,
    updatedAt,
    providerDepositId
  );
  const deposit = db.prepare("SELECT * FROM payment_deposits WHERE provider_deposit_id = ?").get(providerDepositId);
  return deposit ? mapPaymentDeposit(deposit) : null;
};

export const listPaymentDepositsForUser = async (userId) => {
  if (isMysqlEnabled) {
    const rows = await mysqlRows("SELECT * FROM payment_deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT 25", [userId]);
    return rows.map(mapPaymentDeposit);
  }

  if (isCloudflareD1Enabled) {
    return (await d1Query("SELECT * FROM payment_deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT 25", [userId])).map(mapPaymentDeposit);
  }

  const deposits = getDb().prepare("SELECT * FROM payment_deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT 25").all(userId);
  return deposits.map(mapPaymentDeposit);
};

export const completePaymentDeposit = async (providerDepositId, providerResponse = null) => {
  const now = new Date().toISOString();
  const response = providerResponse ? JSON.stringify(providerResponse) : null;

  if (isMysqlEnabled) {
    return withMysqlConnection(async (connection) => {
      await connection.beginTransaction();
      try {
        const [deposits] = await connection.execute("SELECT * FROM payment_deposits WHERE provider_deposit_id = ? FOR UPDATE", [providerDepositId]);
        const deposit = deposits[0];
        if (!deposit) {
          await connection.rollback();
          return null;
        }
        if (deposit.status !== "COMPLETED") {
          await connection.execute("UPDATE users SET wallet = wallet + ? WHERE id = ?", [deposit.amount_rwf, deposit.user_id]);
          await connection.execute(
            `INSERT INTO wallet_transactions (id, user_id, type, amount_rwf, original_amount, original_currency, description, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              randomUUID(),
              deposit.user_id,
              "deposit",
              deposit.amount_rwf,
              deposit.original_amount,
              deposit.original_currency,
              `PawaPay deposit ${providerDepositId}`,
              now,
            ]
          );
        }
        await connection.execute(
          "UPDATE payment_deposits SET status = 'COMPLETED', provider_response = COALESCE(?, provider_response), updated_at = ? WHERE provider_deposit_id = ?",
          [response, now, providerDepositId]
        );
        await connection.commit();
        return mapPaymentDeposit({ ...deposit, status: "COMPLETED", provider_response: response || deposit.provider_response, updated_at: now });
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    });
  }

  if (isCloudflareD1Enabled) {
    const deposit = (await d1Query("SELECT * FROM payment_deposits WHERE provider_deposit_id = ? LIMIT 1", [providerDepositId]))[0];
    if (!deposit) return null;
    const batch = [];
    if (deposit.status !== "COMPLETED") {
      batch.push(
        { sql: "UPDATE users SET wallet = wallet + ? WHERE id = ?", params: [deposit.amount_rwf, deposit.user_id] },
        {
          sql: `INSERT INTO wallet_transactions (id, user_id, type, amount_rwf, original_amount, original_currency, description, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [
            randomUUID(),
            deposit.user_id,
            "deposit",
            deposit.amount_rwf,
            deposit.original_amount,
            deposit.original_currency,
            `PawaPay deposit ${providerDepositId}`,
            now,
          ],
        }
      );
    }
    batch.push({
      sql: "UPDATE payment_deposits SET status = 'COMPLETED', provider_response = COALESCE(?, provider_response), updated_at = ? WHERE provider_deposit_id = ?",
      params: [response, now, providerDepositId],
    });
    await d1Batch(batch);
    return mapPaymentDeposit({ ...deposit, status: "COMPLETED", provider_response: response || deposit.provider_response, updated_at: now });
  }

  const db = getDb();
  db.exec("BEGIN TRANSACTION;");
  try {
    const deposit = db.prepare("SELECT * FROM payment_deposits WHERE provider_deposit_id = ?").get(providerDepositId);
    if (!deposit) {
      db.exec("ROLLBACK;");
      return null;
    }
    if (deposit.status !== "COMPLETED") {
      db.prepare("UPDATE users SET wallet = wallet + ? WHERE id = ?").run(deposit.amount_rwf, deposit.user_id);
      db.prepare(
        `INSERT INTO wallet_transactions (id, user_id, type, amount_rwf, original_amount, original_currency, description, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(randomUUID(), deposit.user_id, "deposit", deposit.amount_rwf, deposit.original_amount, deposit.original_currency, `PawaPay deposit ${providerDepositId}`, now);
    }
    db.prepare("UPDATE payment_deposits SET status = 'COMPLETED', provider_response = COALESCE(?, provider_response), updated_at = ? WHERE provider_deposit_id = ?").run(
      response,
      now,
      providerDepositId
    );
    db.exec("COMMIT;");
    return mapPaymentDeposit({ ...deposit, status: "COMPLETED", provider_response: response || deposit.provider_response, updated_at: now });
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
};

export const listWalletTransactions = async (userId) => {
  if (isMysqlEnabled) {
    return (await mysqlRows("SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 25", [userId])).map(
      mapWalletTransaction
    );
  }

  if (isCloudEnabled) {
    const transactions = await cloudRequest(
      `wallet_transactions?user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.desc&limit=25`
    );
    return transactions.map(mapWalletTransaction);
  }

  if (isCloudflareD1Enabled) {
    return (await d1Query("SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 25", [userId])).map(mapWalletTransaction);
  }

  return getDb()
    .prepare("SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 25")
    .all(userId)
    .map(mapWalletTransaction);
};

export const listAllWalletTransactions = async () => {
  if (isMysqlEnabled) {
    const transactions = await mysqlRows(
      `SELECT wallet_transactions.*, users.name AS customer_name, users.email AS customer_email
       FROM wallet_transactions
       JOIN users ON users.id = wallet_transactions.user_id
       ORDER BY wallet_transactions.created_at DESC
       LIMIT 100`
    );
    return transactions.map((transaction) => ({
      ...mapWalletTransaction(transaction),
      customerName: transaction.customer_name,
      customerEmail: transaction.customer_email,
    }));
  }

  if (isCloudEnabled) {
    const transactions = await cloudRequest("wallet_transactions?select=*,users(name,email)&order=created_at.desc&limit=100");
    return transactions.map((transaction) => ({
      ...mapWalletTransaction(transaction),
      customerName: transaction.users?.name,
      customerEmail: transaction.users?.email,
    }));
  }

  if (isCloudflareD1Enabled) {
    const transactions = await d1Query(
      `SELECT wallet_transactions.*, users.name AS customer_name, users.email AS customer_email
       FROM wallet_transactions
       JOIN users ON users.id = wallet_transactions.user_id
       ORDER BY wallet_transactions.created_at DESC
       LIMIT 100`
    );
    return transactions.map((transaction) => ({
      ...mapWalletTransaction(transaction),
      customerName: transaction.customer_name,
      customerEmail: transaction.customer_email,
    }));
  }

  return getDb()
    .prepare(
      `SELECT wallet_transactions.*, users.name AS customer_name, users.email AS customer_email
       FROM wallet_transactions
       JOIN users ON users.id = wallet_transactions.user_id
       ORDER BY wallet_transactions.created_at DESC
       LIMIT 100`
    )
    .all()
    .map((transaction) => ({
      ...mapWalletTransaction(transaction),
      customerName: transaction.customer_name,
      customerEmail: transaction.customer_email,
    }));
};

const mapSupportMessage = (message) => ({
  id: message.id,
  ticketId: message.ticket_id,
  senderUserId: message.sender_user_id,
  senderRole: message.sender_role,
  message: message.message,
  attachmentName: message.attachment_name,
  attachmentType: message.attachment_type,
  attachmentData: message.attachment_data,
  createdAt: message.created_at,
});

const mapSupportTicket = (ticket, messages = []) => ({
  id: ticket.id,
  ticketId: ticket.ticket_code,
  userId: ticket.user_id,
  orderId: ticket.order_id,
  customerName: ticket.customer_name,
  customerEmail: ticket.customer_email,
  subject: ticket.subject,
  category: ticket.category,
  status: ticket.status,
  priority: ticket.priority,
  createdAt: ticket.created_at,
  updatedAt: ticket.updated_at,
  messages: messages.map(mapSupportMessage),
});

const attachSupportMessages = async (tickets) => {
  if (!tickets.length) return [];
  const ticketIds = tickets.map((ticket) => ticket.id);

  if (isMysqlEnabled) {
    const placeholders = ticketIds.map(() => "?").join(",");
    const messages = await mysqlRows(`SELECT * FROM support_messages WHERE ticket_id IN (${placeholders}) ORDER BY created_at ASC`, ticketIds);
    return tickets.map((ticket) => mapSupportTicket(ticket, messages.filter((message) => message.ticket_id === ticket.id)));
  }

  if (isCloudEnabled) {
    return tickets.map((ticket) => mapSupportTicket(ticket, ticket.support_messages || []));
  }

  if (isCloudflareD1Enabled) {
    const placeholders = ticketIds.map(() => "?").join(",");
    const messages = await d1Query(`SELECT * FROM support_messages WHERE ticket_id IN (${placeholders}) ORDER BY created_at ASC`, ticketIds);
    return tickets.map((ticket) => mapSupportTicket(ticket, messages.filter((message) => message.ticket_id === ticket.id)));
  }

  const placeholders = ticketIds.map(() => "?").join(",");
  const messages = getDb()
    .prepare(`SELECT * FROM support_messages WHERE ticket_id IN (${placeholders}) ORDER BY created_at ASC`)
    .all(...ticketIds);
  return tickets.map((ticket) => mapSupportTicket(ticket, messages.filter((message) => message.ticket_id === ticket.id)));
};

export const createSupportTicket = async (userId, { subject, category, message, orderId = "", attachment = null }) => {
  const now = new Date().toISOString();
  const ticket = {
    id: randomUUID(),
    ticket_code: generateCode("SUP"),
    user_id: userId,
    order_id: orderId || "",
    subject,
    category,
    status: "Open",
    priority: "Normal",
    created_at: now,
    updated_at: now,
  };
  const firstMessage = {
    id: randomUUID(),
    ticket_id: ticket.id,
    sender_user_id: userId,
    sender_role: "customer",
    message,
    attachment_name: attachment?.name || null,
    attachment_type: attachment?.type || null,
    attachment_data: attachment?.data || null,
    created_at: now,
  };

  if (isMysqlEnabled) {
    await withMysqlConnection(async (connection) => {
      await connection.beginTransaction();
      try {
        await connection.execute(
          `INSERT INTO support_tickets (id, ticket_code, user_id, order_id, subject, category, status, priority, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ticket.id,
            ticket.ticket_code,
            ticket.user_id,
            ticket.order_id,
            ticket.subject,
            ticket.category,
            ticket.status,
            ticket.priority,
            ticket.created_at,
            ticket.updated_at,
          ]
        );
        await connection.execute(
          `INSERT INTO support_messages (
            id, ticket_id, sender_user_id, sender_role, message, attachment_name, attachment_type, attachment_data, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            firstMessage.id,
            firstMessage.ticket_id,
            firstMessage.sender_user_id,
            firstMessage.sender_role,
            firstMessage.message,
            firstMessage.attachment_name,
            firstMessage.attachment_type,
            firstMessage.attachment_data,
            firstMessage.created_at,
          ]
        );
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    });
    return mapSupportTicket(ticket, [firstMessage]);
  }

  if (isCloudEnabled) {
    const [createdTicket] = await cloudRequest("support_tickets", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(ticket),
    });
    await cloudRequest("support_messages", {
      method: "POST",
      body: JSON.stringify(firstMessage),
    });
    return mapSupportTicket(createdTicket, [firstMessage]);
  }

  if (isCloudflareD1Enabled) {
    await d1Batch([
      {
        sql: `INSERT INTO support_tickets (id, ticket_code, user_id, order_id, subject, category, status, priority, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          ticket.id,
          ticket.ticket_code,
          ticket.user_id,
          ticket.order_id,
          ticket.subject,
          ticket.category,
          ticket.status,
          ticket.priority,
          ticket.created_at,
          ticket.updated_at,
        ],
      },
      {
        sql: `INSERT INTO support_messages (
          id, ticket_id, sender_user_id, sender_role, message, attachment_name, attachment_type, attachment_data, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          firstMessage.id,
          firstMessage.ticket_id,
          firstMessage.sender_user_id,
          firstMessage.sender_role,
          firstMessage.message,
          firstMessage.attachment_name,
          firstMessage.attachment_type,
          firstMessage.attachment_data,
          firstMessage.created_at,
        ],
      },
    ]);
    return mapSupportTicket(ticket, [firstMessage]);
  }

  const db = getDb();
  db.exec("BEGIN TRANSACTION;");
  try {
    db.prepare(
      `INSERT INTO support_tickets (id, ticket_code, user_id, order_id, subject, category, status, priority, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      ticket.id,
      ticket.ticket_code,
      ticket.user_id,
      ticket.order_id,
      ticket.subject,
      ticket.category,
      ticket.status,
      ticket.priority,
      ticket.created_at,
      ticket.updated_at
    );
    db.prepare(
      `INSERT INTO support_messages (
        id, ticket_id, sender_user_id, sender_role, message, attachment_name, attachment_type, attachment_data, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      firstMessage.id,
      firstMessage.ticket_id,
      firstMessage.sender_user_id,
      firstMessage.sender_role,
      firstMessage.message,
      firstMessage.attachment_name,
      firstMessage.attachment_type,
      firstMessage.attachment_data,
      firstMessage.created_at
    );
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  return mapSupportTicket(ticket, [firstMessage]);
};

export const listSupportTicketsForUser = async (userId) => {
  if (isMysqlEnabled) {
    const tickets = await mysqlRows(
      `SELECT support_tickets.*, users.name AS customer_name, users.email AS customer_email
       FROM support_tickets
       JOIN users ON users.id = support_tickets.user_id
       WHERE support_tickets.user_id = ?
       ORDER BY support_tickets.created_at DESC`,
      [userId]
    );
    return attachSupportMessages(tickets);
  }

  if (isCloudEnabled) {
    const tickets = await cloudRequest(
      `support_tickets?user_id=eq.${encodeURIComponent(userId)}&select=*,support_messages(*)&order=created_at.desc`
    );
    return attachSupportMessages(tickets);
  }

  if (isCloudflareD1Enabled) {
    const tickets = await d1Query(
      `SELECT support_tickets.*, users.name AS customer_name, users.email AS customer_email
       FROM support_tickets
       JOIN users ON users.id = support_tickets.user_id
       WHERE support_tickets.user_id = ?
       ORDER BY support_tickets.created_at DESC`,
      [userId]
    );
    return attachSupportMessages(tickets);
  }

  const tickets = getDb()
    .prepare(
      `SELECT support_tickets.*, users.name AS customer_name, users.email AS customer_email
       FROM support_tickets
       JOIN users ON users.id = support_tickets.user_id
       WHERE support_tickets.user_id = ?
       ORDER BY support_tickets.created_at DESC`
    )
    .all(userId);
  return attachSupportMessages(tickets);
};

export const listAllSupportTickets = async () => {
  if (isMysqlEnabled) {
    const tickets = await mysqlRows(
      `SELECT support_tickets.*, users.name AS customer_name, users.email AS customer_email
       FROM support_tickets
       JOIN users ON users.id = support_tickets.user_id
       ORDER BY support_tickets.created_at DESC`
    );
    return attachSupportMessages(tickets);
  }

  if (isCloudEnabled) {
    const tickets = await cloudRequest("support_tickets?select=*,users(name,email),support_messages(*)&order=created_at.desc");
    return tickets.map((ticket) =>
      mapSupportTicket(
        {
          ...ticket,
          customer_name: ticket.users?.name,
          customer_email: ticket.users?.email,
        },
        ticket.support_messages || []
      )
    );
  }

  if (isCloudflareD1Enabled) {
    const tickets = await d1Query(
      `SELECT support_tickets.*, users.name AS customer_name, users.email AS customer_email
       FROM support_tickets
       JOIN users ON users.id = support_tickets.user_id
       ORDER BY support_tickets.created_at DESC`
    );
    return attachSupportMessages(tickets);
  }

  const tickets = getDb()
    .prepare(
      `SELECT support_tickets.*, users.name AS customer_name, users.email AS customer_email
       FROM support_tickets
       JOIN users ON users.id = support_tickets.user_id
       ORDER BY support_tickets.created_at DESC`
    )
    .all();
  return attachSupportMessages(tickets);
};

const getSupportTicketAccess = async (ticketId) => {
  if (isMysqlEnabled) {
    const rows = await mysqlRows("SELECT * FROM support_tickets WHERE id = ? OR ticket_code = ? LIMIT 1", [ticketId, ticketId]);
    return rows[0] || null;
  }
  if (isCloudEnabled) {
    const [ticket] = await cloudRequest(`support_tickets?or=(id.eq.${encodeURIComponent(ticketId)},ticket_code.eq.${encodeURIComponent(ticketId)})&select=*&limit=1`);
    return ticket || null;
  }
  if (isCloudflareD1Enabled) {
    return (await d1Query("SELECT * FROM support_tickets WHERE id = ? OR ticket_code = ? LIMIT 1", [ticketId, ticketId]))[0] || null;
  }
  return getDb().prepare("SELECT * FROM support_tickets WHERE id = ? OR ticket_code = ?").get(ticketId, ticketId);
};

export const addSupportMessage = async ({ ticketId, userId, message, senderRole, isAdmin = false, attachment = null }) => {
  const ticket = await getSupportTicketAccess(ticketId);
  if (!ticket) return null;
  if (!isAdmin && ticket.user_id !== userId) {
    throw new Error("You can only reply to your own support tickets.");
  }

  const now = new Date().toISOString();
  const supportMessage = {
    id: randomUUID(),
    ticket_id: ticket.id,
    sender_user_id: userId,
    sender_role: senderRole,
    message,
    attachment_name: attachment?.name || null,
    attachment_type: attachment?.type || null,
    attachment_data: attachment?.data || null,
    created_at: now,
  };
  const nextStatus = isAdmin ? "Answered" : "Customer Reply";

  if (isMysqlEnabled) {
    await mysqlRows(
      `INSERT INTO support_messages (
        id, ticket_id, sender_user_id, sender_role, message, attachment_name, attachment_type, attachment_data, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        supportMessage.id,
        supportMessage.ticket_id,
        supportMessage.sender_user_id,
        supportMessage.sender_role,
        supportMessage.message,
        supportMessage.attachment_name,
        supportMessage.attachment_type,
        supportMessage.attachment_data,
        supportMessage.created_at,
      ]
    );
    await mysqlRows("UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?", [nextStatus, now, ticket.id]);
    return supportMessage;
  }

  if (isCloudEnabled) {
    await cloudRequest("support_messages", {
      method: "POST",
      body: JSON.stringify(supportMessage),
    });
    await cloudRequest(`support_tickets?id=eq.${encodeURIComponent(ticket.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: nextStatus, updated_at: now }),
    });
    return supportMessage;
  }

  if (isCloudflareD1Enabled) {
    await d1Batch([
      {
        sql: `INSERT INTO support_messages (
          id, ticket_id, sender_user_id, sender_role, message, attachment_name, attachment_type, attachment_data, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          supportMessage.id,
          supportMessage.ticket_id,
          supportMessage.sender_user_id,
          supportMessage.sender_role,
          supportMessage.message,
          supportMessage.attachment_name,
          supportMessage.attachment_type,
          supportMessage.attachment_data,
          supportMessage.created_at,
        ],
      },
      { sql: "UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?", params: [nextStatus, now, ticket.id] },
    ]);
    return supportMessage;
  }

  getDb()
    .prepare(
      `INSERT INTO support_messages (
        id, ticket_id, sender_user_id, sender_role, message, attachment_name, attachment_type, attachment_data, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      supportMessage.id,
      supportMessage.ticket_id,
      supportMessage.sender_user_id,
      supportMessage.sender_role,
      supportMessage.message,
      supportMessage.attachment_name,
      supportMessage.attachment_type,
      supportMessage.attachment_data,
      supportMessage.created_at
    );
  getDb().prepare("UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?").run(nextStatus, now, ticket.id);
  return supportMessage;
};

export const updateSupportTicketStatus = async (ticketId, status) => {
  const updatedAt = new Date().toISOString();

  if (isMysqlEnabled) {
    await mysqlRows("UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ? OR ticket_code = ?", [status, updatedAt, ticketId, ticketId]);
    const rows = await mysqlRows("SELECT * FROM support_tickets WHERE id = ? OR ticket_code = ? LIMIT 1", [ticketId, ticketId]);
    return rows[0] || null;
  }

  if (isCloudEnabled) {
    const [ticket] = await cloudRequest(`support_tickets?id=eq.${encodeURIComponent(ticketId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status, updated_at: updatedAt }),
    });
    return ticket;
  }

  if (isCloudflareD1Enabled) {
    await d1Query("UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ? OR ticket_code = ?", [status, updatedAt, ticketId, ticketId]);
    return (await d1Query("SELECT * FROM support_tickets WHERE id = ? OR ticket_code = ? LIMIT 1", [ticketId, ticketId]))[0] || null;
  }

  getDb().prepare("UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ? OR ticket_code = ?").run(status, updatedAt, ticketId, ticketId);
  return getDb().prepare("SELECT * FROM support_tickets WHERE id = ? OR ticket_code = ?").get(ticketId, ticketId);
};
