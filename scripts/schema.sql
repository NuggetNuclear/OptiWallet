-- banks
CREATE TABLE IF NOT EXISTS banks (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  short_name TEXT,
  available  BOOLEAN NOT NULL DEFAULT false,
  color      TEXT
);

-- cards
CREATE TABLE IF NOT EXISTS cards (
  id      TEXT PRIMARY KEY,
  bank_id TEXT NOT NULL REFERENCES banks(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  name    TEXT NOT NULL,
  type    TEXT NOT NULL CHECK (type IN ('credit', 'debit', 'prepaid'))
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
  category_id TEXT NOT NULL REFERENCES merchant_categories(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  aliases     TEXT[] NOT NULL DEFAULT '{}'
);

-- promotions
CREATE TABLE IF NOT EXISTS promotions (
  id           TEXT PRIMARY KEY,
  bank_id      TEXT NOT NULL REFERENCES banks(id)     ON DELETE RESTRICT ON UPDATE RESTRICT,
  card_types   TEXT[] NOT NULL CHECK (card_types <@ ARRAY['credit','debit','prepaid']),
  merchant_id  TEXT NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  discount     INTEGER CHECK (discount > 0 AND discount <= 100),
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

-- Session revocation: el token de sesión lleva el token_version del
-- admin al firmarse; incrementarlo (cambio de contraseña, logout) invalida
-- todas sus sesiones vigentes de inmediato. Idempotente: ADD COLUMN IF NOT
-- EXISTS permite correr este schema sobre una DB ya existente sin perder datos.
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

-- Color de marca para bancos. Idempotente.
ALTER TABLE banks ADD COLUMN IF NOT EXISTS color TEXT;

-- admin_login_attempts (rate limiting — one row per failed attempt)
CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id           BIGSERIAL PRIMARY KEY,
  ip_address   TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_login_ip_time ON admin_login_attempts(ip_address, attempted_at);

-- admin_audit_log (activity log — queryable for the last 30 days)
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          BIGSERIAL PRIMARY KEY,
  admin_id    TEXT        NOT NULL,
  admin_email TEXT        NOT NULL,
  action      TEXT        NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  detail      TEXT,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at DESC);

-- Soporte de tarjetas prepago (M4)
ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_type_check;
ALTER TABLE cards ADD CONSTRAINT cards_type_check CHECK (type IN ('credit', 'debit', 'prepaid'));

ALTER TABLE promotions DROP CONSTRAINT IF EXISTS promotions_card_types_check;
ALTER TABLE promotions ADD CONSTRAINT promotions_card_types_check CHECK (card_types <@ ARRAY['credit','debit','prepaid']);

-- Descuento fijo por litro de combustible ($X por litro al pagar por app).
-- discount_unit está limitado a 'liter' por ahora.
-- Extensible a otras unidades (ej. 'kg' para GLP) según requerimientos futuros.
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS discount_per_unit INTEGER;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS discount_unit      TEXT
  CHECK (discount_unit IN ('liter'));

-- Permitir que discount sea nulo para cuando se usa discount_per_unit/discount_unit
ALTER TABLE promotions ALTER COLUMN discount DROP NOT NULL;

-- XOR: exactamente uno de los dos mecanismos debe estar presente.
-- Filas existentes (discount NOT NULL, discount_per_unit NULL) satisfacen la condición izquierda.
ALTER TABLE promotions DROP CONSTRAINT IF EXISTS promotions_discount_xor;
ALTER TABLE promotions ADD CONSTRAINT promotions_discount_xor CHECK (
  (discount IS NOT NULL AND discount_per_unit IS NULL AND discount_unit IS NULL)
  OR
  (discount IS NULL AND discount_per_unit IS NOT NULL AND discount_unit IS NOT NULL)
);

-- Indica si esta promoción puede combinarse (apilarse) con otras simultáneamente.
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS stackable BOOLEAN NOT NULL DEFAULT false;

-- Restricción a tarjetas específicas (M5 — "tarjeta única").
-- Por defecto vacío: la promo aplica a TODAS las tarjetas del banco cuyo `type`
-- esté en `card_types` (comportamiento histórico). Cuando se pueblan uno o más
-- card_ids, la promo aplica EXCLUSIVAMENTE a esas tarjetas (ej. "solo con la
-- Mastercard Black"), ignorando card_types como filtro de matching. Esto resuelve
-- el caso de un banco con varias tarjetas de crédito donde la promo es de una sola.
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS card_ids TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_promotions_card_ids ON promotions USING GIN(card_ids);

-- ── Popularidad de comercios (cold-start del ranking de promociones) ──────────
-- Sin tráfico propio al lanzar, la popularidad inicial de cada comercio se
-- bootstrappea desde Google Places (reseñas, rating, # de sucursales) vía el
-- script scripts/compute-merchant-popularity.ts. Guardamos las señales CRUDAS
-- además del prior derivado para poder re-tunear los pesos sin volver a pegarle
-- a la API. Cuando exista tráfico real, `popularity_prior` actúa como las
-- "visitas fantasma" del promedio bayesiano y se diluye solo.
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS places_rating        REAL;     -- rating Google 0–5 (promedio ponderado entre sucursales)
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS places_ratings_total INTEGER;  -- suma de reseñas sobre las sucursales encontradas
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS places_branches      INTEGER;  -- # de sucursales devueltas por Places (proxy de footprint)
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS popularity_prior     REAL NOT NULL DEFAULT 0.5;  -- prior normalizado 0–1 para el ranking
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS merchant_tier        SMALLINT NOT NULL DEFAULT 3 CHECK (merchant_tier BETWEEN 1 AND 5);  -- bucket 1–5 derivado del prior (display/debug)
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS popularity_updated_at TIMESTAMPTZ;  -- última vez que el script actualizó las señales

-- ── Central de operaciones: scraping → staging → revisión → promotions ────────
-- Los scrapers (uno por banco; ver scripts/scrapers/) corren localmente — el
-- fetch pasa por un navegador real porque los sitios están detrás de anti-bot
-- (Imperva en Banco de Chile). El JSON resultante se SUBE al panel admin, que lo
-- deja en `promo_staging` para revisión humana. Nada entra a `promotions` sin
-- aprobación: protege un dato que afecta plata del usuario de errores de parseo.

-- scraper_runs: una fila por importación (= un fetch subido) por banco.
CREATE TABLE IF NOT EXISTS scraper_runs (
  id          BIGSERIAL PRIMARY KEY,
  bank_id     TEXT NOT NULL REFERENCES banks(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  source      TEXT NOT NULL DEFAULT 'upload',  -- upload | api | manual
  total       INTEGER NOT NULL DEFAULT 0,      -- registros 'clean' recibidos
  imported    INTEGER NOT NULL DEFAULT 0,      -- insertados a staging (sin contar duplicados)
  skipped     INTEGER NOT NULL DEFAULT 0,      -- duplicados omitidos (mismo fingerprint pendiente/aprobado)
  edge_count  INTEGER NOT NULL DEFAULT 0,      -- casos borde reportados por el scraper
  admin_email TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scraper_runs_bank ON scraper_runs(bank_id, created_at DESC);

-- promo_staging: promos scrapeadas esperando revisión. Mismo shape que
-- `promotions` salvo que `merchant_id` puede venir nulo (se resuelve/crea en la
-- revisión) y agrega metadatos de control (status, warnings, fingerprint).
CREATE TABLE IF NOT EXISTS promo_staging (
  id                BIGSERIAL PRIMARY KEY,
  run_id            BIGINT REFERENCES scraper_runs(id) ON DELETE SET NULL,
  bank_id           TEXT NOT NULL REFERENCES banks(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  -- payload parseado (shape promotions)
  merchant_name     TEXT NOT NULL,                       -- nombre crudo scrapeado (Titulo)
  merchant_id       TEXT,                                -- resuelto en revisión; null hasta entonces
  discount          INTEGER,
  discount_per_unit INTEGER,
  discount_unit     TEXT,
  cap               INTEGER,
  min_purchase      INTEGER,
  days_of_week      SMALLINT[] NOT NULL DEFAULT '{}',
  card_types        TEXT[] NOT NULL DEFAULT '{}',
  card_ids          TEXT[] NOT NULL DEFAULT '{}',
  source_cards      TEXT[] NOT NULL DEFAULT '{}',         -- slugs granulares del banco (futura granularidad)
  modality          TEXT,
  start_date        DATE,
  end_date          DATE,
  stackable         BOOLEAN NOT NULL DEFAULT false,
  code              TEXT,
  conditions        TEXT,
  source            TEXT NOT NULL,
  -- control / verificaciones
  warnings          TEXT[] NOT NULL DEFAULT '{}',         -- flags no bloqueantes detectados al importar
  fingerprint       TEXT,                                 -- dedup: hash estable del contenido
  created_promo_id  TEXT,                                 -- id en `promotions` generado al aprobar
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at       TIMESTAMPTZ,
  reviewed_by       TEXT
);
CREATE INDEX IF NOT EXISTS idx_promo_staging_bank_status ON promo_staging(bank_id, status);
CREATE INDEX IF NOT EXISTS idx_promo_staging_fingerprint ON promo_staging(fingerprint);
