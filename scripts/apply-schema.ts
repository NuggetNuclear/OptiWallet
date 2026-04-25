import { neon } from "@neondatabase/serverless";
import * as fs from "fs";
import * as path from "path";

const sql = neon(process.env.DATABASE_URL!);

async function applySchema() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");
  
  // Split by semicolons and run each statement individually
  const statements = schema
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  console.log(`📋 Ejecutando ${statements.length} statements...`);

  for (const stmt of statements) {
    console.log(`  → ${stmt.substring(0, 60)}...`);
    await sql.query(stmt);
  }

  console.log("✅ Schema aplicado correctamente");
}

applySchema().catch((err) => {
  console.error("❌ Error aplicando schema:", err);
  process.exit(1);
});
