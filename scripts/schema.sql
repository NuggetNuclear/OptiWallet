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

-- merchant_tags: atributos transversales granulares (Sushi, Delivery, Pet-Friendly…).
-- A diferencia de category_id (uno por comercio), un comercio puede tener varios tags.
CREATE TABLE IF NOT EXISTS merchant_tags (
  id    TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  emoji TEXT
);

-- merchant_tag_map: relación N:N comercio ↔ tag.
-- ON DELETE CASCADE (a diferencia del RESTRICT del resto): borrar un tag o un
-- comercio limpia sus filas de mapeo automáticamente, sin bloquear la operación.
CREATE TABLE IF NOT EXISTS merchant_tag_map (
  merchant_id TEXT NOT NULL REFERENCES merchants(id)     ON DELETE CASCADE,
  tag_id      TEXT NOT NULL REFERENCES merchant_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (merchant_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_merchant_tag_map_tag ON merchant_tag_map(tag_id);

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

-- Color de marca para bancos. Idempotente.
ALTER TABLE banks ADD COLUMN IF NOT EXISTS color TEXT;

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

-- promotion_codes (for dynamic multi-code promotions)
CREATE TABLE IF NOT EXISTS promotion_codes (
  id           BIGSERIAL PRIMARY KEY,
  promotion_id TEXT NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  code         TEXT NOT NULL,
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_promo_codes_promo ON promotion_codes(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promo_codes_dates ON promotion_codes(start_date, end_date);

-- ── App settings (feature flags y configuración global) ────────────────────────
-- Tabla key-value minimalista para flags que no merecen una tabla propia.
-- `maintenance_mode` bloquea el acceso público a la app; el flag lo escribe el
-- panel admin (repo separado) sobre esta misma fila del Neon compartido — este
-- repo solo lo lee (ver lib/maintenance.ts).
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT  -- email del admin que hizo el último cambio
);

-- Semilla: maintenance_mode OFF por defecto (idempotente).
INSERT INTO app_settings (key, value)
  VALUES ('maintenance_mode', 'false')
  ON CONFLICT (key) DO NOTHING;

-- ── promo_events (tráfico real para dilución bayesiana del popularity_prior) ──
-- Registra impresiones y taps de promociones para reemplazar gradualmente el
-- cold-start (popularity_prior de Google Places) con señales propias.
-- Diseño:
--   event_type: 'view'  → la promo apareció en el feed/detalle del usuario
--               'tap'   → el usuario tocó/expandió la promo
--   session_id: hash anónimo de (fingerprint + fecha) — sin datos personales.
--   location:   dónde ocurrió ('feed' | 'merchant_detail' | 'search')
-- Cuando N eventos acumulados supere un umbral, el ranking puede computar:
--   pop_efectiva = (N_taps + K * popularity_prior) / (N_views + K)
-- donde K es el pseudo-count bayesiano (ej. K = 50).
CREATE TABLE IF NOT EXISTS promo_events (
  id           BIGSERIAL    PRIMARY KEY,
  promotion_id TEXT         NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  merchant_id  TEXT         NOT NULL,   -- denormalizado para queries analíticas
  bank_id      TEXT         NOT NULL,   -- denormalizado
  event_type   TEXT         NOT NULL CHECK (event_type IN ('view', 'tap')),
  location     TEXT         NOT NULL CHECK (location IN ('feed', 'merchant_detail', 'search')),
  session_id   TEXT,                    -- anónimo — no vincula a usuario individual
  occurred_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promo_events_promo     ON promo_events(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promo_events_merchant  ON promo_events(merchant_id);
CREATE INDEX IF NOT EXISTS idx_promo_events_occurred  ON promo_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_promo_events_type      ON promo_events(event_type);

-- ── promo_reports (reportes de usuarios sobre promos: caducadas, incorrectas…) ──
-- Captura en dos fases: el reporte se crea al instante cuando el usuario toca 👎
-- (reason NULL); si luego elige un motivo, se refina con un PATCH. Si no elige, el
-- reporte igual cuenta. Se triage desde el panel admin (repo separado).
--   reason: NULL (sin especificar) | 'expired' | 'wrong_discount' | 'not_found' | 'other'
--   status: 'pending' → 'resolved' | 'dismissed'
--   session_id: hash anónimo — sin datos personales (igual que promo_events)
CREATE TABLE IF NOT EXISTS promo_reports (
  id           BIGSERIAL   PRIMARY KEY,
  promotion_id TEXT        NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  merchant_id  TEXT        NOT NULL,   -- denormalizado para queries del panel
  bank_id      TEXT        NOT NULL,   -- denormalizado
  reason       TEXT        CHECK (reason IN ('expired', 'wrong_discount', 'not_found', 'other')),
  note         TEXT,                    -- texto libre opcional (reason = 'other')
  status       TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
  session_id   TEXT,                    -- anónimo
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ,
  resolved_by  TEXT
);

CREATE INDEX IF NOT EXISTS idx_promo_reports_promo   ON promo_reports(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promo_reports_status  ON promo_reports(status);
CREATE INDEX IF NOT EXISTS idx_promo_reports_created ON promo_reports(created_at DESC);
