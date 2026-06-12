// scripts/seed.ts
// Resetea la base y carga datos mock para testear todo el flujo.
//
//   npm run db:seed
//
// ⚠️  DESTRUCTIVO: dropea las tablas y las recrea desde schema.sql.
// Esto garantiza que el schema de la BD coincide 1:1 con scripts/schema.sql
// (apply-schema.ts usa CREATE TABLE IF NOT EXISTS, que NO altera tablas
// existentes — por eso agregar una columna al .sql no la agrega a Neon).

import { neon } from "@neondatabase/serverless";
import * as fs from "fs";
import * as path from "path";

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL no está definida. Asegúrate de tener el .env configurado.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

// ─── Datos mock ──────────────────────────────────────────────────────────────

const BANKS = [
  { id: "santander", name: "Banco Santander Chile", short_name: "Santander", available: true },
  { id: "banco-chile", name: "Banco de Chile", short_name: "Banco de Chile", available: true },
  { id: "falabella", name: "Banco Falabella", short_name: "Falabella", available: true },
];

const CARDS = [
  { id: "santander-credit", bank_id: "santander", name: "Santander Visa", type: "credit" },
  { id: "santander-debit", bank_id: "santander", name: "Santander Débito", type: "debit" },
  { id: "banco-chile-credit", bank_id: "banco-chile", name: "Banco de Chile Mastercard", type: "credit" },
  { id: "banco-chile-debit", bank_id: "banco-chile", name: "Banco de Chile Débito", type: "debit" },
  { id: "falabella-credit", bank_id: "falabella", name: "CMR Visa", type: "credit" },
  { id: "falabella-debit", bank_id: "falabella", name: "Falabella Débito", type: "debit" },
];

const CATEGORIES = [
  { id: "supermercado", label: "Supermercados", emoji: "🛒" },
  { id: "comida-rapida", label: "Comida Rápida", emoji: "🍔" },
  { id: "bencina", label: "Combustible", emoji: "⛽" },
  { id: "cafe", label: "Cafeterías", emoji: "☕" },
];

const MERCHANTS = [
  { id: "jumbo", name: "Jumbo", category_id: "supermercado", aliases: ["cencosud"] },
  { id: "lider", name: "Líder", category_id: "supermercado", aliases: ["walmart", "express de lider"] },
  { id: "mcdonalds", name: "McDonald's", category_id: "comida-rapida", aliases: ["mac", "mcdo"] },
  { id: "copec", name: "Copec", category_id: "bencina", aliases: ["bencina", "combustible"] },
  { id: "juan-valdez", name: "Juan Valdez", category_id: "cafe", aliases: ["cafe"] },
];

// Días: 0=domingo … 6=sábado (igual que getUTCDay en las rutas).
// days_of_week vacío = aplica todos los días.
// 3 promos activas por banco + 3 casos borde para testear los filtros.
const PROMOTIONS = [
  // ── Santander ──
  { id: "san-jumbo-mie", bank_id: "santander", card_types: ["credit"], merchant_id: "jumbo",
    discount: 25, cap: 15000, min_purchase: 30000, days_of_week: [3], modality: "presencial",
    code: null, conditions: "Tope $15.000 por transacción. Solo miércoles.", source: "https://banco.santander.cl/beneficios" },
  { id: "san-copec-all", bank_id: "santander", card_types: ["credit", "debit"], merchant_id: "copec",
    discount: 10, cap: 8000, min_purchase: null, days_of_week: [], modality: "presencial",
    code: null, conditions: "Todos los días pagando con app Copec.", source: "https://banco.santander.cl/beneficios" },
  { id: "san-mcd-finde", bank_id: "santander", card_types: ["debit"], merchant_id: "mcdonalds",
    discount: 20, cap: null, min_purchase: 5000, days_of_week: [6, 0], modality: "both",
    code: "SANTA20", conditions: "Fines de semana, presencial y app.", source: "https://banco.santander.cl/beneficios" },

  // ── Banco de Chile ──
  { id: "bch-lider-mar", bank_id: "banco-chile", card_types: ["credit"], merchant_id: "lider",
    discount: 30, cap: 20000, min_purchase: 40000, days_of_week: [2], modality: "presencial",
    code: null, conditions: "Solo martes. Tope $20.000.", source: "https://portales.bancochile.cl/beneficios" },
  { id: "bch-jv-all", bank_id: "banco-chile", card_types: ["credit", "debit"], merchant_id: "juan-valdez",
    discount: 15, cap: null, min_purchase: null, days_of_week: [], modality: "presencial",
    code: null, conditions: "Todos los días en tiendas Juan Valdez.", source: "https://portales.bancochile.cl/beneficios" },
  { id: "bch-jumbo-jue", bank_id: "banco-chile", card_types: ["debit"], merchant_id: "jumbo",
    discount: 12, cap: 10000, min_purchase: 20000, days_of_week: [4], modality: "online",
    code: "CHILE12", conditions: "Solo jueves en jumbo.cl.", source: "https://portales.bancochile.cl/beneficios" },

  // ── Falabella ──
  { id: "fal-lider-all", bank_id: "falabella", card_types: ["credit"], merchant_id: "lider",
    discount: 8, cap: 6000, min_purchase: null, days_of_week: [], modality: "both",
    code: null, conditions: "Todos los días con CMR.", source: "https://www.bancofalabella.cl/beneficios" },
  { id: "fal-mcd-lun", bank_id: "falabella", card_types: ["credit", "debit"], merchant_id: "mcdonalds",
    discount: 35, cap: 5000, min_purchase: 8000, days_of_week: [1], modality: "presencial",
    code: null, conditions: "Solo lunes. Tope $5.000.", source: "https://www.bancofalabella.cl/beneficios" },
  { id: "fal-copec-vie", bank_id: "falabella", card_types: ["debit"], merchant_id: "copec",
    discount: 18, cap: 12000, min_purchase: 15000, days_of_week: [5], modality: "presencial",
    code: "CMR18", conditions: "Solo viernes en estaciones Copec.", source: "https://www.bancofalabella.cl/beneficios" },

  // ── Casos borde (NO deben aparecer en recomendaciones) ──
  { id: "edge-inactive", bank_id: "santander", card_types: ["credit"], merchant_id: "jumbo",
    discount: 50, cap: null, min_purchase: null, days_of_week: [], modality: "both",
    code: null, conditions: "Promo desactivada — no debe mostrarse.", source: "https://example.com", active: false },
  { id: "edge-expired", bank_id: "banco-chile", card_types: ["credit"], merchant_id: "copec",
    discount: 40, cap: null, min_purchase: null, days_of_week: [], modality: "both",
    code: null, conditions: "Promo vencida — no debe mostrarse.", source: "https://example.com",
    start_date: "2026-01-01", end_date: "2026-01-31" },
  { id: "edge-future", bank_id: "falabella", card_types: ["credit"], merchant_id: "jumbo",
    discount: 45, cap: null, min_purchase: null, days_of_week: [], modality: "both",
    code: null, conditions: "Promo futura — no debe mostrarse aún.", source: "https://example.com",
    start_date: "2027-01-01", end_date: "2027-12-31" },
] as const;

// ─── Reset + seed ────────────────────────────────────────────────────────────

async function reset() {
  console.log("🗑️  Dropeando tablas…");
  // Orden inverso a las FKs (CASCADE por si hay dependencias nuevas).
  for (const table of ["promotions", "cards", "merchants", "merchant_categories", "banks"]) {
    await sql.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
  }

  console.log("📋 Reaplicando schema.sql…");
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  const statements = schema.split(";").map((s) => s.trim()).filter((s) => s.length > 0);
  for (const stmt of statements) {
    await sql.query(stmt);
  }
}

async function seed() {
  console.log("🌱 Insertando datos mock…");

  for (const b of BANKS) {
    await sql.query(
      `INSERT INTO banks (id, name, short_name, available) VALUES ($1, $2, $3, $4)`,
      [b.id, b.name, b.short_name, b.available]
    );
  }

  for (const c of CARDS) {
    await sql.query(
      `INSERT INTO cards (id, bank_id, name, type) VALUES ($1, $2, $3, $4)`,
      [c.id, c.bank_id, c.name, c.type]
    );
  }

  for (const cat of CATEGORIES) {
    await sql.query(
      `INSERT INTO merchant_categories (id, label, emoji) VALUES ($1, $2, $3)`,
      [cat.id, cat.label, cat.emoji]
    );
  }

  for (const m of MERCHANTS) {
    await sql.query(
      `INSERT INTO merchants (id, name, category_id, aliases) VALUES ($1, $2, $3, $4::text[])`,
      [m.id, m.name, m.category_id, m.aliases]
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  for (const p of PROMOTIONS) {
    await sql.query(
      `INSERT INTO promotions
         (id, bank_id, card_types, merchant_id, discount, cap, min_purchase,
          days_of_week, start_date, end_date, modality, code, conditions,
          source, verified_at, active)
       VALUES ($1, $2, $3::text[], $4, $5, $6, $7,
               $8::smallint[], $9, $10, $11, $12, $13,
               $14, $15, $16)`,
      [
        p.id, p.bank_id, [...p.card_types], p.merchant_id, p.discount,
        p.cap, p.min_purchase, [...p.days_of_week],
        ("start_date" in p ? p.start_date : null),
        ("end_date" in p ? p.end_date : null),
        p.modality, p.code, p.conditions, p.source, today,
        ("active" in p ? p.active : true),
      ]
    );
  }
}

async function main() {
  await reset();
  await seed();
  const [{ count }] = await sql.query(`SELECT count(*)::int AS count FROM promotions`) as { count: number }[];
  console.log(`✅ Listo: ${BANKS.length} bancos, ${CARDS.length} tarjetas, ${MERCHANTS.length} comercios, ${count} promos (3 son casos borde inactivos/vencidos/futuros).`);
}

main().catch((err) => {
  console.error("❌ Error en el seed:", err);
  process.exit(1);
});
