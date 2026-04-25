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
