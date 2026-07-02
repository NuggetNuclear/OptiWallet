import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL no está definida.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function main() {
  // "Hoy" en hora de Chile, NO en el UTC del runner: un cron después de las
  // ~20:00-21:00 hora chilena ya está en "mañana" UTC y activaría/borraría
  // códigos horas antes de tiempo. Mismo criterio que /api/recommendations.
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" })
    .format(new Date());
  console.log(`⏰ Ejecutando refresh de promociones para el día: ${todayStr}`);

  // 1. Actualizar códigos activos para el día de hoy
  console.log("🔄 Actualizando códigos de promociones activos...");
  const activeUpdates = await sql`
    UPDATE promotions p
    SET code = pc.code,
        active = true,
        updated_at = now()
    FROM promotion_codes pc
    WHERE pc.promotion_id = p.id
      AND pc.start_date <= ${todayStr}::date
      AND pc.end_date   >= ${todayStr}::date
      AND (p.code IS NULL OR p.code <> pc.code OR p.active = false)
    RETURNING p.id, p.merchant_id, pc.code
  `;
  console.log(`✅ Se actualizaron/activaron ${activeUpdates.length} promociones con su código actual.`);
  for (const row of activeUpdates) {
    console.log(`  - Promo ${row.id} (${row.merchant_id}): Código set a "${row.code}"`);
  }

  // 2. Desactivar promociones con códigos únicamente futuros (aún no vigentes)
  console.log("⏳ Desactivando promociones con códigos únicamente futuros...");
  const futureDeactivations = await sql`
    UPDATE promotions p
    SET active = false,
        code = null,
        updated_at = now()
    WHERE p.active = true
      -- Tiene códigos en la tabla de códigos
      AND EXISTS (SELECT 1 FROM promotion_codes WHERE promotion_id = p.id)
      -- Ninguno está activo hoy
      AND NOT EXISTS (
        SELECT 1 FROM promotion_codes 
        WHERE promotion_id = p.id 
          AND start_date <= ${todayStr}::date 
          AND end_date >= ${todayStr}::date
      )
      -- Pero sí tiene códigos futuros
      AND EXISTS (
        SELECT 1 FROM promotion_codes 
        WHERE promotion_id = p.id 
          AND start_date > ${todayStr}::date
      )
    RETURNING p.id, p.merchant_id
  `;
  console.log(`✅ Se pausaron ${futureDeactivations.length} promociones debido a que sus códigos son futuros.`);
  for (const row of futureDeactivations) {
    console.log(`  - Promo ${row.id} (${row.merchant_id}): Pausada (esperando vigencia de código futuro)`);
  }

  // 3. Eliminar promociones cuyos códigos hayan expirado completamente en el pasado
  console.log("🗑️ Eliminando promociones cuyos códigos expiraron por completo...");
  const expiredDeletions = await sql`
    DELETE FROM promotions p
    WHERE 
      -- Tiene códigos en la tabla
      EXISTS (SELECT 1 FROM promotion_codes WHERE promotion_id = p.id)
      -- Ninguno está activo hoy ni en el futuro (todos expiraron en el pasado)
      AND NOT EXISTS (
        SELECT 1 FROM promotion_codes 
        WHERE promotion_id = p.id 
          AND end_date >= ${todayStr}::date
      )
    RETURNING p.id, p.merchant_id
  `;
  console.log(`✅ Se eliminaron ${expiredDeletions.length} promociones con cupones totalmente expirados.`);
  for (const row of expiredDeletions) {
    console.log(`  - Promo ${row.id} (${row.merchant_id}): Eliminada por completo.`);
  }

  console.log("✨ Refresh de promociones completado con éxito.");
}

main().catch((err) => {
  console.error("❌ Error en refresh:", err);
  process.exit(1);
});
