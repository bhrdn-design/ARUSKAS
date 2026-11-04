PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'IDR',
  timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  avatar_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  user_agent TEXT,
  ip_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON user_sessions(expires_at);

CREATE TABLE IF NOT EXISTS recovery_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recovery_user ON recovery_codes(user_id, used_at);

CREATE TABLE IF NOT EXISTS auth_attempts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  attempted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_attempts ON auth_attempts(username, attempted_at);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  date_format TEXT NOT NULL DEFAULT 'DD MMM YYYY',
  theme TEXT NOT NULL DEFAULT 'light',
  notifications_json TEXT NOT NULL DEFAULT '{"daily":false,"weekly":false,"monthly":false}',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('cash','bank','ewallet','other')),
  opening_balance INTEGER NOT NULL DEFAULT 0 CHECK(opening_balance >= 0),
  color TEXT NOT NULL DEFAULT '#1D8A70',
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, name)
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id, archived);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('income','expense')),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748B',
  icon TEXT NOT NULL DEFAULT 'circle',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, kind, name)
);
CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id, kind);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receipt_no TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK(kind IN ('income','expense')),
  amount INTEGER NOT NULL CHECK(amount > 0),
  category_id TEXT NOT NULL REFERENCES categories(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  occurred_at TEXT NOT NULL,
  counterparty TEXT,
  description TEXT NOT NULL,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'web' CHECK(source IN ('web','telegram','import')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, occurred_at DESC, deleted_at);
CREATE INDEX IF NOT EXISTS idx_transactions_user_kind ON transactions(user_id, kind, occurred_at DESC, deleted_at);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);

CREATE TABLE IF NOT EXISTS transaction_attachments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attachments_transaction ON transaction_attachments(transaction_id, user_id);

CREATE TABLE IF NOT EXISTS telegram_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL UNIQUE,
  telegram_username TEXT,
  linked_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_telegram_user ON telegram_links(user_id);

CREATE TABLE IF NOT EXISTS telegram_pairing_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pairing_expiry ON telegram_pairing_codes(expires_at, used_at);
CREATE INDEX IF NOT EXISTS idx_pairing_user ON telegram_pairing_codes(user_id);

CREATE TABLE IF NOT EXISTS telegram_pending_states (
  chat_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pending_user ON telegram_pending_states(user_id);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_user_unique ON telegram_links(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_type ON notifications(user_id, type);

CREATE TABLE IF NOT EXISTS telegram_updates (
  update_id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL,
  processed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_telegram_updates_received ON telegram_updates(received_at);

CREATE TABLE IF NOT EXISTS backup_import_map (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_receipt_no TEXT NOT NULL,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  imported_at TEXT NOT NULL,
  PRIMARY KEY(user_id, source_receipt_no),
  UNIQUE(transaction_id)
);
