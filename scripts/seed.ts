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
