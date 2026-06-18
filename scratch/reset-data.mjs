import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL);

console.log("🧹 Reseteando promociones, comercios y restaurando staging a 'pending'...");

// Borrar promociones y comercios creados para re-evaluar
await sql`DELETE FROM promotions`;
await sql`DELETE FROM merchants`;

// Devolver todas las filas de staging a 'pending'
await sql`
  UPDATE promo_staging
  SET status = 'pending',
      merchant_id = null,
      created_promo_id = null,
      reviewed_at = null,
      reviewed_by = null
`;

console.log("✅ Base de datos restaurada. Todo el backlog está en 'pending' listo para volver a probar.");
process.exit(0);
