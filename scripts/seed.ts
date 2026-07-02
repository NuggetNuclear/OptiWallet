// scripts/seed.ts — generado por gen-seed.ts
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
  { id: "banco-chile", name: "Banco de Chile", short_name: "Banco de Chile", available: true, color: "#002884" },
  { id: "banco-estado", name: "Banco Estado", short_name: null, available: false, color: "#ee801d" },
  { id: "bci", name: "Banco BCI", short_name: "BCI", available: true, color: "#fdd700" },
  { id: "copec-pay", name: "Copec Pay", short_name: null, available: false, color: "#000fff" },
  { id: "falabella", name: "Banco Falabella", short_name: "Falabella", available: true, color: "#5eb64f" },
  { id: "itau", name: "Banco Itaú", short_name: "Itaú", available: true, color: "#ff6200" },
  { id: "machbank", name: "MACHBANK", short_name: "Mach", available: true, color: "#6200ee" },
  { id: "mercado-pago", name: "Mercado Pago", short_name: null, available: false, color: "#00bcff" },
  { id: "santander", name: "Banco Santander Chile", short_name: "Santander", available: true, color: "#EC0000" },
  { id: "tenpo", name: "Tenpo", short_name: null, available: true, color: "#03ff94" },
];

const CARDS = [
  { id: "bchile-mastercard-credito-black", bank_id: "banco-chile", name: "Mastercard Black", type: "credit" },
  { id: "bchile-mastercard-credito-dorada", bank_id: "banco-chile", name: "Mastercard Dorada", type: "credit" },
  { id: "bchile-mastercard-credito-platinum", bank_id: "banco-chile", name: "Mastercard Platinum", type: "credit" },
  { id: "bchile-visa-credito-gold", bank_id: "banco-chile", name: "Visa Gold", type: "credit" },
  { id: "bchile-visa-credito-infinite", bank_id: "banco-chile", name: "Visa Infinite", type: "credit" },
  { id: "bchile-visa-credito-platinum", bank_id: "banco-chile", name: "Visa Platinum", type: "credit" },
  { id: "bchile-visa-credito-signature", bank_id: "banco-chile", name: "Visa Signature", type: "credit" },
  { id: "bchile-visa-cuenta-fan", bank_id: "banco-chile", name: "Débito Visa Fan", type: "debit" },
  { id: "bchile-visa-debito-bch", bank_id: "banco-chile", name: "Débito Visa", type: "debit" },
  { id: "bchile-visa-debito-infinite", bank_id: "banco-chile", name: "Débito Visa Infinite", type: "debit" },
  { id: "bchile-visa-debito-signature", bank_id: "banco-chile", name: "Débito Visa Signature", type: "debit" },
  { id: "bchile-visa-fan-credito", bank_id: "banco-chile", name: "Fan Crédito", type: "credit" },
  { id: "bci-aa-infinite", bank_id: "bci", name: "AAdvantage® Visa Infinite", type: "credit" },
  { id: "bci-aa-master", bank_id: "bci", name: "AAdvantage® Mastercard Black", type: "credit" },
  { id: "bci-debit", bank_id: "bci", name: "Bci Visa Débito", type: "debit" },
  { id: "bci-gold", bank_id: "bci", name: "Visa Gold", type: "credit" },
  { id: "bci-infinite", bank_id: "bci", name: "Visa Infinite", type: "credit" },
  { id: "bci-mas-black", bank_id: "bci", name: "Mastercard Black", type: "credit" },
  { id: "bci-mas-gold", bank_id: "bci", name: "Mastercard Gold", type: "credit" },
  { id: "bci-mas-plat", bank_id: "bci", name: "Mastercard Platinum", type: "credit" },
  { id: "bci-normal", bank_id: "bci", name: "Visa Classic", type: "credit" },
  { id: "bci-plat", bank_id: "bci", name: "Visa Platinum", type: "credit" },
  { id: "bci-signature", bank_id: "bci", name: "Visa Signature", type: "credit" },
  { id: "falabella-cmr-elite", bank_id: "falabella", name: "CMR Elite", type: "credit" },
  { id: "falabella-cmr-premium", bank_id: "falabella", name: "CMR Premium", type: "credit" },
  { id: "falabella-cmr-standard", bank_id: "falabella", name: "CMR", type: "credit" },
  { id: "falabella-debit", bank_id: "falabella", name: "Débito Falabella", type: "debit" },
  { id: "itau-black", bank_id: "itau", name: "Crédito Black", type: "credit" },
  { id: "itau-blue", bank_id: "itau", name: "Crédito Blue", type: "credit" },
  { id: "itau-debit", bank_id: "itau", name: "Debito Itaú", type: "debit" },
  { id: "itau-legend", bank_id: "itau", name: "Crédito Legend", type: "credit" },
  { id: "machbank-credit", bank_id: "machbank", name: "Crédito MACHBANK", type: "credit" },
  { id: "machbank-debit", bank_id: "machbank", name: "Débito MACHBANK", type: "debit" },
  { id: "machbank-prepaid", bank_id: "machbank", name: "Prepago MACHBANK", type: "prepaid" },
  { id: "santander-american", bank_id: "santander", name: "The Platinum Card American Express", type: "credit" },
  { id: "santander-gold", bank_id: "santander", name: "Gold Santander LATAM Pass", type: "credit" },
  { id: "santander-life", bank_id: "santander", name: "Santander Life", type: "credit" },
  { id: "santander-plat", bank_id: "santander", name: "Platinum Santander LATAM Pass", type: "credit" },
  { id: "santander-worldember", bank_id: "santander", name: "WorldMember Santander LATAM Pass", type: "credit" },
  { id: "santander-worldember-l", bank_id: "santander", name: "WorldMember Limited Santander LATAM Pass", type: "credit" },
  { id: "tenpo-credit", bank_id: "tenpo", name: "Tenpo Credito", type: "credit" },
  { id: "tenpo-prepaid", bank_id: "tenpo", name: "Tenpo Prepago", type: "prepaid" },
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
    await sql.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
  }
  console.log("📋 Reaplicando schema.sql…");
  const schema = fs.readFileSync(path.join(import.meta.dirname, "schema.sql"), "utf-8");
  const stripped = schema.replace(/--[^\n]*/g, "");
  const statements = stripped.split(";").map((s) => s.trim()).filter((s) => s.length > 0);
  for (const stmt of statements) {
    await sql.query(stmt);
  }
}

async function seed() {
  console.log("🌱 Insertando categorías, bancos y tarjetas…");

  for (const cat of CATEGORIES) {
    await sql.query(
      `INSERT INTO merchant_categories (id, label, emoji) VALUES ($1, $2, $3)`,
      [cat.id, cat.label, cat.emoji]
    );
  }

  for (const tag of TAGS) {
    await sql.query(
      `INSERT INTO merchant_tags (id, label, emoji) VALUES ($1, $2, $3)`,
      [tag.id, tag.label, tag.emoji]
    );
  }

  for (const b of BANKS) {
    await sql.query(
      `INSERT INTO banks (id, name, short_name, available, color) VALUES ($1, $2, $3, $4, $5)`,
      [b.id, b.name, b.short_name, b.available, b.color]
    );
  }

  for (const c of CARDS) {
    await sql.query(
      `INSERT INTO cards (id, bank_id, name, type) VALUES ($1, $2, $3, $4)`,
      [c.id, c.bank_id, c.name, c.type]
    );
  }
}

async function main() {
  await reset();
  await seed();
  console.log(`✅ Listo: ${BANKS.length} bancos, ${CARDS.length} tarjetas.`);
}

main().catch((err) => {
  console.error("❌ Error en el seed:", err);
  process.exit(1);
});
