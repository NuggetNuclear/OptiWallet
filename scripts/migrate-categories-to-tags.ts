// scripts/migrate-categories-to-tags.ts
// Migra una base EN VIVO del modelo plano (31 categorías) al modelo de dos niveles:
//   · ~8 categorías macro (broad buckets) — cada comercio pertenece a una.
//   · tags (las antiguas categorías granulares) — un comercio puede tener varias.
//
//   npm run db:migrate-tags
//
// IDEMPOTENTE y NO destructivo: se puede correr varias veces sin efectos adicionales.
// Requiere que el schema nuevo ya esté aplicado (npm run db:schema) para que existan
// las tablas merchant_tags / merchant_tag_map.

import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL no está definida.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

// Categorías macro destino.
const MACROS = [
  { id: "supermercados", label: "Supermercados", emoji: "🛒" },
  { id: "gastronomia", label: "Gastronomía", emoji: "🍽️" },
  { id: "compras", label: "Compras", emoji: "🛍️" },
  { id: "salud-belleza", label: "Salud y Belleza", emoji: "💆" },
  { id: "entretencion", label: "Entretención", emoji: "🎬" },
  { id: "automotriz-servicios", label: "Automotriz y Servicios", emoji: "🚗" },
  { id: "viajes", label: "Viajes", emoji: "✈️" },
  { id: "otros", label: "Otros", emoji: "🏷️" },
];

// Antiguas categorías granulares (id → label/emoji reutilizados como tag)…
const LEGACY = [
  { id: "supermercados", label: "Supermercados", emoji: "🛒" },
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
  { id: "librerias-papelerias", label: "Librerías y Papelerías", emoji: "📖" },
  { id: "otros", label: "Otros", emoji: "🏷️" },
];

// …y a qué macro se reasigna cada antigua categoría.
const MAP: Record<string, string> = {
  supermercados: "supermercados",
  combustible: "automotriz-servicios",
  restaurantes: "gastronomia",
  "cafes-pastelerias": "gastronomia",
  sushi: "gastronomia",
  pizzerias: "gastronomia",
  "hamburguesas-sandwiches": "gastronomia",
  "comida-rapida": "gastronomia",
  "heladerias-postres": "gastronomia",
  farmacias: "salud-belleza",
  salud: "salud-belleza",
  dental: "salud-belleza",
  "vestuario-moda": "compras",
  calzado: "compras",
  "grandes-tiendas": "compras",
  "belleza-cosmetica": "salud-belleza",
  "tecnologia-electro": "compras",
  "hogar-decoracion": "compras",
  "viajes-turismo": "viajes",
  "hoteles-alojamiento": "viajes",
  "entretencion-cine": "entretencion",
  "conciertos-eventos": "entretencion",
  "deportes-fitness": "entretencion",
  mascotas: "otros",
  automotriz: "automotriz-servicios",
  "educacion-cursos": "otros",
  "servicios-cuentas": "automotriz-servicios",
  "delivery-apps": "gastronomia",
  "licores-botillerias": "gastronomia",
  "juguetes-ninos": "compras",
  "librerias-papelerias": "compras",
  otros: "otros",
};

const macroIds = new Set(MACROS.map((m) => m.id));

async function main() {
  console.log("🔁 Migrando categorías planas → macro + tags…");

  // 1. Insertar las categorías macro (idempotente).
  for (const m of MACROS) {
    await sql`
      INSERT INTO merchant_categories (id, label, emoji)
      VALUES (${m.id}, ${m.label}, ${m.emoji})
      ON CONFLICT (id) DO NOTHING
    `;
  }

  // 2. Crear un tag por cada categoría granular (las que NO son macro).
  for (const c of LEGACY) {
    if (macroIds.has(c.id)) continue;
    await sql`
      INSERT INTO merchant_tags (id, label, emoji)
      VALUES (${c.id}, ${c.label}, ${c.emoji})
      ON CONFLICT (id) DO NOTHING
    `;
  }

  // 3. Por cada categoría antigua: etiquetar sus comercios y repuntarlos al macro.
  // El driver de Neon no expone rowCount fiable, así que contamos con SELECT antes de escribir.
  let repointed = 0;
  let tagged = 0;
  for (const c of LEGACY) {
    const macro = MAP[c.id];
    if (!macro) continue;

    const cnt = await sql`SELECT COUNT(*)::int AS n FROM merchants WHERE category_id = ${c.id}`;
    const n = (cnt[0] as { n: number } | undefined)?.n ?? 0;

    if (!macroIds.has(c.id)) {
      await sql`
        INSERT INTO merchant_tag_map (merchant_id, tag_id)
        SELECT id, ${c.id} FROM merchants WHERE category_id = ${c.id}
        ON CONFLICT DO NOTHING
      `;
      tagged += n;
    }

    if (macro !== c.id) {
      await sql`UPDATE merchants SET category_id = ${macro} WHERE category_id = ${c.id}`;
      repointed += n;
    }
  }

  // 4. Borrar categorías antiguas que ya no son macro y quedaron sin comercios.
  let deleted = 0;
  for (const c of LEGACY) {
    if (macroIds.has(c.id)) continue;
    const before = await sql`SELECT 1 FROM merchant_categories WHERE id = ${c.id}`;
    if (!before.length) continue;
    await sql`
      DELETE FROM merchant_categories
      WHERE id = ${c.id}
        AND NOT EXISTS (SELECT 1 FROM merchants WHERE category_id = ${c.id})
    `;
    const after = await sql`SELECT 1 FROM merchant_categories WHERE id = ${c.id}`;
    if (!after.length) deleted += 1;
  }

  console.log(`✅ Listo: ${repointed} comercios repuntados, ${tagged} tags asignados, ${deleted} categorías antiguas eliminadas.`);
}

main().catch((err) => {
  console.error("❌ Error en la migración:", err);
  process.exit(1);
});
