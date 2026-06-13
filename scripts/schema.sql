-- banks
CREATE TABLE IF NOT EXISTS banks (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  short_name TEXT,
  available  BOOLEAN NOT NULL DEFAULT false
);

-- cards
CREATE TABLE IF NOT EXISTS cards (
  id      TEXT PRIMARY KEY,
  bank_id TEXT NOT NULL REFERENCES banks(id),
  name    TEXT NOT NULL,
  type    TEXT NOT NULL CHECK (type IN ('credit', 'debit'))
);

-- merchant_categories
CREATE TABLE IF NOT EXISTS merchant_categories (
  id    TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  emoji TEXT NOT NULL
);

-- merchants
CREATE TABLE IF NOT EXISTS merchants (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES merchant_categories(id),
  aliases     TEXT[] NOT NULL DEFAULT '{}'
);

-- promotions
CREATE TABLE IF NOT EXISTS promotions (
  id           TEXT PRIMARY KEY,
  bank_id      TEXT NOT NULL REFERENCES banks(id),
  card_types   TEXT[] NOT NULL,
  merchant_id  TEXT NOT NULL REFERENCES merchants(id),
  discount     INTEGER NOT NULL CHECK (discount > 0 AND discount <= 100),
  cap          INTEGER,
  min_purchase INTEGER,
  days_of_week SMALLINT[] NOT NULL DEFAULT '{}',
  start_date   DATE,
  end_date     DATE,
  modality     TEXT NOT NULL CHECK (modality IN ('presencial', 'online', 'both')),
  code         TEXT,
  conditions   TEXT,
  source       TEXT NOT NULL,
  verified_at  DATE NOT NULL,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promotions_merchant ON promotions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_promotions_bank     ON promotions(bank_id);
CREATE INDEX IF NOT EXISTS idx_promotions_active   ON promotions(active);
CREATE INDEX IF NOT EXISTS idx_promotions_days     ON promotions USING GIN(days_of_week);

-- admin_users
CREATE TABLE IF NOT EXISTS admin_users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  totp_secret   TEXT NOT NULL,
  totp_enabled  BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

-- admin_login_attempts (rate limiting — one row per failed attempt)
CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id           BIGSERIAL PRIMARY KEY,
  ip_address   TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_login_ip_time ON admin_login_attempts(ip_address, attempted_at);
