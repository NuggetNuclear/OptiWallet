import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL);

const STANDARD_CATEGORIES = [
  { id: "supermercados", label: "Supermercados", emoji: "🛒" },
  { id: "combustible", label: "Combustible", emoji: "⛽" },
  { id: "restaurantes", label: "Restaurantes y Cafés", emoji: "🍽️" },
  { id: "comida-rapida", label: "Comida Rápida", emoji: "🍔" },
  { id: "farmacias", label: "Farmacias y Salud", emoji: "💊" },
  { id: "tiendas", label: "Tiendas y Vestuario", emoji: "🛍️" },
  { id: "viajes", label: "Viajes y Turismo", emoji: "✈️" },
  { id: "servicios", label: "Servicios y Cuentas", emoji: "💳" },
  { id: "entretencion", label: "Entretención y Cine", emoji: "🎬" },
  { id: "otros", label: "Otros", emoji: "🏷️" }
];

console.log("🌱 Insertando categorías estándar en la base de datos...");

for (const cat of STANDARD_CATEGORIES) {
  await sql`
    INSERT INTO merchant_categories (id, label, emoji)
    VALUES (${cat.id}, ${cat.label}, ${cat.emoji})
    ON CONFLICT (id) DO UPDATE
    SET label = EXCLUDED.label, emoji = EXCLUDED.emoji
  `;
}

console.log("✅ Categorías insertadas con éxito.");
process.exit(0);
