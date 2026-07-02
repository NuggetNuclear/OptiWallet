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

// Categorías macro (broad buckets). Cada comercio pertenece a EXACTAMENTE una.
// El detalle fino (sushi, farmacias, delivery…) vive ahora como TAGS.
const CATEGORIES = [
  { id: "supermercados", label: "Supermercados", emoji: "🛒" },
  { id: "gastronomia", label: "Gastronomía", emoji: "🍽️" },
  { id: "compras", label: "Compras", emoji: "🛍️" },
  { id: "salud-belleza", label: "Salud y Belleza", emoji: "💆" },
  { id: "entretencion", label: "Entretención", emoji: "🎬" },
  { id: "automotriz-servicios", label: "Automotriz y Servicios", emoji: "🚗" },
  { id: "viajes", label: "Viajes", emoji: "✈️" },
  { id: "otros", label: "Otros", emoji: "🏷️" }
];

// Tags: atributos transversales que un comercio puede tener en cantidad variable.
// Provienen de las antiguas categorías granulares.
const TAGS = [
  { id: "combustible", label: "Combustible", emoji: "⛽" },
  { id: "restaurantes", label: "Restaurantes", emoji: "🍽️" },
  { id: "cafes-pastelerias", label: "Cafés y Pastelerías", emoji: "☕" },
  { id: "sushi", label: "Sushi", emoji: "🍣" },
  { id: "pizzerias", label: "Pizzerías", emoji: "🍕" },
  { id: "hamburguesas-sandwiches", label: "Hamburguesas y Sándwiches", emoji: "🍔" },
  { id: "comida-rapida", label: "Comida Rápida", emoji: "🍟" },
  { id: "heladerias-postres", label: "Heladerías y Postres", emoji: "🍦" },
  { id: "farmacias", label: "Farmacias", emoji: "💊" },
  { id: "salud", label: "Salud y Bienestar", emoji: "🏥" },
  { id: "dental", label: "Dental", emoji: "🦷" },
  { id: "vestuario-moda", label: "Vestuario y Moda", emoji: "👕" },
  { id: "calzado", label: "Calzado", emoji: "👟" },
  { id: "grandes-tiendas", label: "Grandes Tiendas y Retail", emoji: "🏬" },
  { id: "belleza-cosmetica", label: "Belleza y Cosmética", emoji: "💄" },
  { id: "tecnologia-electro", label: "Tecnología y Electrodomésticos", emoji: "💻" },
  { id: "hogar-decoracion", label: "Hogar y Decoración", emoji: "🏡" },
  { id: "viajes-turismo", label: "Viajes y Turismo", emoji: "✈️" },
  { id: "hoteles-alojamiento", label: "Hoteles y Alojamiento", emoji: "🏨" },
  { id: "entretencion-cine", label: "Entretención y Cine", emoji: "🎬" },
  { id: "conciertos-eventos", label: "Conciertos y Eventos", emoji: "🎟️" },
  { id: "deportes-fitness", label: "Deportes y Fitness", emoji: "🏋️" },
  { id: "mascotas", label: "Mascotas", emoji: "🐶" },
  { id: "automotriz", label: "Automotriz y Talleres", emoji: "🚗" },
  { id: "educacion-cursos", label: "Educación y Cursos", emoji: "📚" },
  { id: "servicios-cuentas", label: "Servicios y Cuentas", emoji: "💳" },
  { id: "delivery-apps", label: "Apps de Delivery", emoji: "🛵" },
  { id: "licores-botillerias", label: "Licores y Botillerías", emoji: "🍾" },
  { id: "juguetes-ninos", label: "Juguetes y Niños", emoji: "🧸" },
  { id: "librerias-papelerias", label: "Librerías y Papelerías", emoji: "📖" }
];

async function reset() {
  console.log("🗑️  Dropeando tablas…");
  for (const table of ["promotion_codes", "promotions", "merchant_tag_map", "merchant_tags", "cards", "merchants", "merchant_categories", "banks"]) {
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
  console.log("🌱 Insertando categorías, bancos y tarjetas…");

  for (const cat of CATEGORIES) {
    await sql.query(
      \`INSERT INTO merchant_categories (id, label, emoji) VALUES ($1, $2, $3)\`,
      [cat.id, cat.label, cat.emoji]
    );
  }

  for (const tag of TAGS) {
    await sql.query(
      \`INSERT INTO merchant_tags (id, label, emoji) VALUES ($1, $2, $3)\`,
      [tag.id, tag.label, tag.emoji]
    );
  }

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
