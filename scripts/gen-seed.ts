// scripts/gen-seed.ts
// Lee bancos y tarjetas desde la DB y regenera scripts/seed.ts con esos datos.
// Las secciones de categorías, comercios y promociones mock se mantienen intactas.
//
//   npx dotenv -e .env -e .env.local -- node scripts/gen-seed.ts

import { neon } from "@neondatabase/serverless";
import * as fs from "fs";
import * as path from "path";

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL no está definida.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

interface Bank {
  id: string;
  name: string;
  short_name: string | null;
  available: boolean;
  color: string | null;
}

interface Card {
  id: string;
  bank_id: string;
  name: string;
  type: string;
}

async function main() {
  console.log("🔍 Leyendo bancos y tarjetas desde la DB…");

  const banks = (await sql`SELECT id, name, short_name, available, color FROM banks ORDER BY id`) as Bank[];
  const cards = (await sql`SELECT id, bank_id, name, type FROM cards ORDER BY bank_id, id`) as Card[];

  console.log(`   ${banks.length} bancos, ${cards.length} tarjetas`);

  const banksTs = banks
    .map((b) => {
      const short = b.short_name ? JSON.stringify(b.short_name) : "null";
      const color = b.color ? JSON.stringify(b.color) : "null";
      return `  { id: ${JSON.stringify(b.id)}, name: ${JSON.stringify(b.name)}, short_name: ${short}, available: ${b.available}, color: ${color} },`;
    })
    .join("\n");

  const cardsTs = cards
    .map((c) => {
      return `  { id: ${JSON.stringify(c.id)}, bank_id: ${JSON.stringify(c.bank_id)}, name: ${JSON.stringify(c.name)}, type: ${JSON.stringify(c.type)} },`;
    })
    .join("\n");

  const seedPath = path.join(import.meta.dirname, "seed.ts");
  const newSeed = `// scripts/seed.ts — generado por gen-seed.ts
// Resetea la base y carga bancos + tarjetas reales.
//
//   npm run db:seed
//
// ⚠️  DESTRUCTIVO: dropea las tablas y las recrea desde schema.sql.

import { neon } from "@neondatabase/serverless";
import * as fs from "fs";
import * as path from "path";

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL no está definida.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const BANKS = [
${banksTs}
];

const CARDS = [
${cardsTs}
];

async function reset() {
  console.log("🗑️  Dropeando tablas…");
  for (const table of ["promo_staging", "scraper_runs", "promotions", "cards", "merchants", "merchant_categories", "banks"]) {
    await sql.query(\`DROP TABLE IF EXISTS \${table} CASCADE\`);
  }
  console.log("📋 Reaplicando schema.sql…");
  const schema = fs.readFileSync(path.join(import.meta.dirname, "schema.sql"), "utf-8");
  const stripped = schema.replace(/--[^\\n]*/g, "");
  const statements = stripped.split(";").map((s) => s.trim()).filter((s) => s.length > 0);
  for (const stmt of statements) {
    await sql.query(stmt);
  }
}

async function seed() {
  console.log("🌱 Insertando bancos y tarjetas…");

  for (const b of BANKS) {
    await sql.query(
      \`INSERT INTO banks (id, name, short_name, available, color) VALUES ($1, $2, $3, $4, $5)\`,
      [b.id, b.name, b.short_name, b.available, b.color]
    );
  }

  for (const c of CARDS) {
    await sql.query(
      \`INSERT INTO cards (id, bank_id, name, type) VALUES ($1, $2, $3, $4)\`,
      [c.id, c.bank_id, c.name, c.type]
    );
  }
}

async function main() {
  await reset();
  await seed();
  console.log(\`✅ Listo: \${BANKS.length} bancos, \${CARDS.length} tarjetas.\`);
}

main().catch((err) => {
  console.error("❌ Error en el seed:", err);
  process.exit(1);
});
`;

  fs.writeFileSync(seedPath, newSeed, "utf-8");
  console.log("✅ scripts/seed.ts regenerado con datos reales (solo bancos y tarjetas).");
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
