PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  wallet REAL NOT NULL DEFAULT 0,
  is_admin INTEGER NOT NULL DEFAULT 0,
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
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_code TEXT NOT NULL UNIQUE,
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
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);

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
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON wallet_transactions(user_id);

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
CREATE INDEX IF NOT EXISTS idx_payment_deposits_user_id ON payment_deposits(user_id);

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
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);

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
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_id ON support_messages(ticket_id);
