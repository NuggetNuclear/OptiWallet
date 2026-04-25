Acá va el plan de ejecución completo. Lo estructuré para que puedas pasarlo directamente a un agente de código (Claude Code, Cursor, etc.).

---

## Info que necesitas tener lista antes de darle el plan al agente

**Variables de entorno que el agente va a necesitar que le pases:**

```
DATABASE_URL=postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
```


no toques `lib/data/*.ts` ni `lib/recommendation-engine.ts` todavía — esos son el fallback, tu tienes que correr el schema por consola

## Plan de ejecución para el agente

---

### CONTEXTO DEL PROYECTO

OptiWallet es una Next.js 16 + React 19 + TypeScript + Tailwind CSS 4 PWA que recomienda tarjetas de crédito/débito chilenas según promociones del banco BCI. Actualmente usa datos estáticos en `lib/data/*.ts`. El objetivo de esta tarea es migrar a una base de datos Neon (PostgreSQL serverless) manteniendo los datos estáticos como fallback durante la transición. El motor de recomendaciones (`lib/recommendation-engine.ts`) y los datos estáticos NO se tocan en esta fase.

---

### TAREA 1 — Instalar dependencias

**Archivos a modificar:** `package.json`

Instalar:
- `@neondatabase/serverless` como dependencia de producción
- `tsx` como dependencia de desarrollo
- `dotenv-cli` como dependencia de desarrollo

Comando:
```bash
npm install @neondatabase/serverless
npm install -D tsx dotenv-cli
```

Verificar que quedaron en `package.json` correctamente.

---

### TAREA 2 — Agregar variables de entorno

**Archivos a crear:** `.env.local`

Crear `.env.local` en la raíz del proyecto con:
```
DATABASE_URL=<el agente debe pedirte este valor>
```

Verificar que `.env.local` ya está en `.gitignore` (lo está, está como `.env.*`).

Crear también `.env.example` para documentación:
```
DATABASE_URL=postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
```

---

### TAREA 3 — Crear el cliente de base de datos

**Archivos a crear:** `lib/db.ts`

```typescript
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL no está definida");
}

export const sql = neon(process.env.DATABASE_URL);
```

Este módulo solo se importa desde server-side code (Route Handlers, scripts). Nunca desde componentes cliente.

---

### TAREA 4 — Crear el schema SQL

**Archivos a crear:** `scripts/schema.sql`

```sql
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
```

---

### TAREA 5 — Crear el script de seed

**Archivos a crear:** `scripts/seed.ts`

El script debe importar los datos de `lib/data/*.ts` y hacer upsert en cada tabla en este orden (por las foreign keys): banks → cards → merchant_categories → merchants → promotions.

```typescript
import { neon } from "@neondatabase/serverless";
import { BANKS } from "../lib/data/banks";
import { CARDS } from "../lib/data/cards";
import { CATEGORIES } from "../lib/data/categories";
import { MERCHANTS } from "../lib/data/merchants";
import { PROMOTIONS } from "../lib/data/promotions";

const sql = neon(process.env.DATABASE_URL!);

async function seed() {
  console.log("🌱 Iniciando seed...");

  console.log("  → Banks...");
  for (const b of BANKS) {
    await sql`
      INSERT INTO banks (id, name, short_name, available)
      VALUES (${b.id}, ${b.name}, ${b.shortName ?? null}, ${b.available})
      ON CONFLICT (id) DO UPDATE SET
        name       = EXCLUDED.name,
        short_name = EXCLUDED.short_name,
        available  = EXCLUDED.available
    `;
  }

  console.log("  → Cards...");
  for (const c of CARDS) {
    await sql`
      INSERT INTO cards (id, bank_id, name, type)
      VALUES (${c.id}, ${c.bankId}, ${c.name}, ${c.type})
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        type = EXCLUDED.type
    `;
  }

  console.log("  → Categories...");
  for (const cat of CATEGORIES) {
    await sql`
      INSERT INTO merchant_categories (id, label, emoji)
      VALUES (${cat.id}, ${cat.label}, ${cat.emoji})
      ON CONFLICT (id) DO UPDATE SET
        label = EXCLUDED.label,
        emoji = EXCLUDED.emoji
    `;
  }

  console.log("  → Merchants...");
  for (const m of MERCHANTS) {
    await sql`
      INSERT INTO merchants (id, name, category_id, aliases)
      VALUES (${m.id}, ${m.name}, ${m.categoryId}, ${m.aliases ?? []})
      ON CONFLICT (id) DO UPDATE SET
        name        = EXCLUDED.name,
        category_id = EXCLUDED.category_id,
        aliases     = EXCLUDED.aliases
    `;
  }

  console.log("  → Promotions...");
  for (const p of PROMOTIONS) {
    await sql`
      INSERT INTO promotions (
        id, bank_id, card_types, merchant_id, discount, cap,
        days_of_week, start_date, end_date, modality, code,
        conditions, source, verified_at, active
      ) VALUES (
        ${p.id}, ${p.bankId}, ${p.cardTypes}, ${p.merchantId},
        ${p.discount}, ${p.cap ?? null}, ${p.daysOfWeek},
        ${p.startDate ?? null}, ${p.endDate ?? null},
        ${p.modality}, ${p.code ?? null}, ${p.conditions ?? null},
        ${p.source}, ${p.verifiedAt}, true
      )
      ON CONFLICT (id) DO UPDATE SET
        discount     = EXCLUDED.discount,
        cap          = EXCLUDED.cap,
        days_of_week = EXCLUDED.days_of_week,
        start_date   = EXCLUDED.start_date,
        end_date     = EXCLUDED.end_date,
        modality     = EXCLUDED.modality,
        code         = EXCLUDED.code,
        conditions   = EXCLUDED.conditions,
        source       = EXCLUDED.source,
        verified_at  = EXCLUDED.verified_at,
        updated_at   = now()
    `;
  }

  console.log("✅ Seed completo");
}

seed().catch((err) => {
  console.error("❌ Seed falló:", err);
  process.exit(1);
});
```

---

### TAREA 6 — Agregar scripts en package.json

**Archivos a modificar:** `package.json`

Agregar en la sección `"scripts"`:

```json
"db:seed": "dotenv-cli -e .env.local -- tsx scripts/seed.ts",
"db:seed:prod": "tsx scripts/seed.ts"
```

El `dotenv-cli` carga `.env.local` automáticamente para desarrollo local.

---

### TAREA 7 — Crear los Route Handlers

**Archivos a crear:**
- `app/api/banks/route.ts`
- `app/api/merchants/route.ts`
- `app/api/recommendations/route.ts`
- `app/api/promotions/[merchantId]/route.ts`

#### `app/api/banks/route.ts`

```typescript
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET() {
  const banks = await sql`
    SELECT * FROM banks ORDER BY available DESC, name ASC
  `;
  return NextResponse.json(banks);
}
```

#### `app/api/merchants/route.ts`

```typescript
import { sql } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const q        = req.nextUrl.searchParams.get("q")?.toLowerCase() ?? "";
  const category = req.nextUrl.searchParams.get("category");

  const merchants = await sql`
    SELECT
      m.id,
      m.name,
      m.category_id,
      m.aliases,
      mc.label AS category_label,
      mc.emoji
    FROM merchants m
    JOIN merchant_categories mc ON m.category_id = mc.id
    WHERE
      (
        ${q} = ''
        OR lower(m.name) LIKE ${"%" + q + "%"}
        OR EXISTS (
          SELECT 1 FROM unnest(m.aliases) AS alias
          WHERE lower(alias) LIKE ${"%" + q + "%"}
        )
      )
      AND (
        ${category ?? ""} = ''
        OR m.category_id = ${category ?? ""}
      )
    ORDER BY m.name
    LIMIT 50
  `;

  return NextResponse.json(merchants);
}
```

#### `app/api/recommendations/route.ts`

```typescript
import { sql } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const cardIds    = req.nextUrl.searchParams.getAll("cardIds");
  const dateStr    = req.nextUrl.searchParams.get("date")
                     ?? new Date().toISOString().split("T")[0];
  const merchantId = req.nextUrl.searchParams.get("merchantId");

  if (!cardIds.length) return NextResponse.json([]);

  const dayOfWeek = new Date(dateStr + "T12:00:00Z").getDay();

  const rows = await sql`
    SELECT
      p.id             AS promotion_id,
      p.discount,
      p.cap,
      p.days_of_week,
      p.start_date,
      p.end_date,
      p.modality,
      p.code,
      p.conditions,
      p.source,
      p.verified_at,
      m.id             AS merchant_id,
      m.name           AS merchant_name,
      m.category_id,
      mc.label         AS category_label,
      mc.emoji,
      c.id             AS card_id,
      c.name           AS card_name,
      c.type           AS card_type,
      c.bank_id
    FROM promotions p
    JOIN merchants m
      ON p.merchant_id = m.id
    JOIN merchant_categories mc
      ON m.category_id = mc.id
    JOIN cards c
      ON c.bank_id = p.bank_id
     AND c.type    = ANY(p.card_types)
     AND c.id      = ANY(${cardIds})
    WHERE p.active = true
      AND (
            cardinality(p.days_of_week) = 0
            OR ${dayOfWeek} = ANY(p.days_of_week)
          )
      AND (p.start_date IS NULL OR p.start_date <= ${dateStr}::date)
      AND (p.end_date   IS NULL OR p.end_date   >= ${dateStr}::date)
      AND (
            ${merchantId ?? ""} = ''
            OR p.merchant_id = ${merchantId ?? ""}
          )
    ORDER BY p.discount DESC
  `;

  return NextResponse.json(rows);
}
```

#### `app/api/promotions/[merchantId]/route.ts`

```typescript
import { sql } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(
  _req: NextRequest,
  { params }: { params: { merchantId: string } }
) {
  const promos = await sql`
    SELECT
      p.*,
      b.name AS bank_name
    FROM promotions p
    JOIN banks b ON p.bank_id = b.id
    WHERE p.merchant_id = ${params.merchantId}
      AND p.active = true
    ORDER BY p.discount DESC
  `;

  return NextResponse.json(promos);
}
```

---

### TAREA 8 — Crear el cliente de API para el frontend

**Archivos a crear:** `lib/api-client.ts`

Este módulo reemplaza los imports directos de `lib/data/*` en los componentes cliente. Por ahora coexiste con los datos estáticos — la migración de componentes es fase siguiente.

```typescript
export type ApiRecommendation = {
  promotion_id:   string;
  discount:       number;
  cap:            number | null;
  days_of_week:   number[];
  modality:       string;
  code:           string | null;
  conditions:     string | null;
  merchant_id:    string;
  merchant_name:  string;
  category_id:    string;
  category_label: string;
  emoji:          string;
  card_id:        string;
  card_name:      string;
  card_type:      string;
  bank_id:        string;
};

export type ApiMerchant = {
  id:             string;
  name:           string;
  category_id:    string;
  aliases:        string[];
  category_label: string;
  emoji:          string;
};

function buildUrl(path: string, params: Record<string, string | string[]>): string {
  const url = new URL(path, window.location.origin);
  for (const [key, val] of Object.entries(params)) {
    if (Array.isArray(val)) {
      val.forEach((v) => url.searchParams.append(key, v));
    } else if (val) {
      url.searchParams.set(key, val);
    }
  }
  return url.toString();
}

export async function getRecommendationsFromApi(params: {
  cardIds:     string[];
  date:        Date;
  merchantId?: string;
}): Promise<ApiRecommendation[]> {
  const url = buildUrl("/api/recommendations", {
    cardIds:    params.cardIds,
    date:       params.date.toISOString().split("T")[0],
    ...(params.merchantId ? { merchantId: params.merchantId } : {}),
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function getMerchantsFromApi(params?: {
  q?:        string;
  category?: string;
}): Promise<ApiMerchant[]> {
  const url = buildUrl("/api/merchants", {
    ...(params?.q        ? { q:        params.q }        : {}),
    ...(params?.category ? { category: params.category } : {}),
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
```

---

### TAREA 9 — Verificación

El agente debe correr estas verificaciones en orden y reportar resultado de cada una:

**9.1 — TypeScript compila sin errores:**
```bash
npx tsc --noEmit
```

**9.2 — El servidor de desarrollo levanta:**
```bash
npm run dev
# Verificar que http://localhost:3000 responde
```

**9.3 — Los endpoints responden (con DATABASE_URL cargada):**
```bash
# En otra terminal mientras dev está corriendo:
curl http://localhost:3000/api/banks
curl http://localhost:3000/api/merchants
curl "http://localhost:3000/api/merchants?q=kfc"
curl "http://localhost:3000/api/recommendations?cardIds=bci-credit&date=2026-04-21"
curl http://localhost:3000/api/promotions/kfc
```

Cada endpoint debe devolver JSON válido sin errores 500.

**9.4 — El seed corre sin errores:**
```bash
npm run db:seed
```
Debe imprimir `✅ Seed completo` sin errores.

---

### TAREA 10 — Verificación en Neon

Después del seed el agente debe conectarse a Neon y verificar los conteos. Puede hacerlo con un script de verificación:

**Archivos a crear:** `scripts/verify-db.ts`

```typescript
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function verify() {
  const counts = await sql`
    SELECT
      (SELECT count(*) FROM banks)               AS banks,
      (SELECT count(*) FROM cards)               AS cards,
      (SELECT count(*) FROM merchant_categories) AS categories,
      (SELECT count(*) FROM merchants)           AS merchants,
      (SELECT count(*) FROM promotions)          AS promotions
  `;
  console.table(counts[0]);

  const expected = {
    banks: 14, cards: 2, categories: 11, merchants: 25, promotions: 25
  };

  for (const [table, count] of Object.entries(expected)) {
    const actual = Number((counts[0] as Record<string, unknown>)[table]);
    if (actual !== count) {
      console.error(`❌ ${table}: esperado ${count}, encontrado ${actual}`);
    } else {
      console.log(`✅ ${table}: ${actual}`);
    }
  }
}

verify().catch(console.error);
```

Agregar a `package.json`:
```json
"db:verify": "dotenv-cli -e .env.local -- tsx scripts/verify-db.ts"
```

Correr con `npm run db:verify` — todos deben mostrar ✅.

---

### LO QUE EL AGENTE NO DEBE TOCAR

- `lib/data/banks.ts`
- `lib/data/cards.ts`
- `lib/data/categories.ts`
- `lib/data/merchants.ts`
- `lib/data/promotions.ts`
- `lib/recommendation-engine.ts`
- `lib/use-wallet.ts`
- Cualquier componente existente en `components/`
- `app/app/page.tsx`

La migración de componentes para consumir los nuevos endpoints es la fase siguiente y se hace por separado.

---

### RESUMEN DE ARCHIVOS QUE EL AGENTE CREA O MODIFICA

| Archivo | Acción |
|---|---|
| `.env.local` | Crear |
| `.env.example` | Crear |
| `lib/db.ts` | Crear |
| `lib/api-client.ts` | Crear |
| `scripts/schema.sql` | Crear |
| `scripts/seed.ts` | Crear |
| `scripts/verify-db.ts` | Crear |
| `app/api/banks/route.ts` | Crear |
| `app/api/merchants/route.ts` | Crear |
| `app/api/recommendations/route.ts` | Crear |
| `app/api/promotions/[merchantId]/route.ts` | Crear |
| `package.json` | Modificar (agregar deps + scripts) |