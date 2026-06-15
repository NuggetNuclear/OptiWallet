import { neon } from "@neondatabase/serverless";
import * as fs from "fs";
import * as path from "path";

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL no está definida. Asegúrate de tener el .env configurado.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function applySchema() {
  const schemaPath = path.join(import.meta.dirname, "schema.sql");
  const raw = fs.readFileSync(schemaPath, "utf-8");

  // Strip `-- ...` line comments BEFORE splitting so a semicolon inside a comment
  // can't corrupt the statement list. (audit L3)
  const stripped = raw.replace(/--[^\n]*/g, "");

  const statements = stripped
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  console.log(`📋 Ejecutando ${statements.length} statements...`);

  // Nota: el driver HTTP de Neon corre cada statement en su propia transacción
  // implícita (no hay BEGIN/COMMIT global). Todo el schema es DDL idempotente
  // (CREATE/ALTER ... IF NOT EXISTS), así que re-correr el script tras un fallo
  // parcial es seguro y no destruye datos.
  for (const [i, stmt] of statements.entries()) {
    console.log(`  → [${i + 1}/${statements.length}] ${stmt.substring(0, 60)}...`);
    try {
      await sql.query(stmt);
    } catch (err) {
      console.error(`❌ Falló el statement ${i + 1}:\n${stmt}\n`, err);
      throw err;
    }
  }

  console.log("✅ Schema aplicado correctamente");
}

applySchema().catch((err) => {
  console.error("❌ Error aplicando schema:", err);
  process.exit(1);
});
