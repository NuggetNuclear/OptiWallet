import { describe, it } from "node:test";
import { ok } from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";

describe("schema.sql — integridad del esquema de base de datos", () => {
  const schemaPath = path.join(process.cwd(), "scripts", "schema.sql");
  const schemaContent = fs.readFileSync(schemaPath, "utf-8");

  it("el archivo schema.sql existe y no está vacío", () => {
    ok(fs.existsSync(schemaPath), "El archivo schema.sql debe existir");
    ok(schemaContent.length > 0, "El esquema no debe estar vacío");
  });

  it("define la tabla admin_users", () => {
    ok(schemaContent.includes("CREATE TABLE IF NOT EXISTS admin_users"), "Debe definir la tabla admin_users");
  });

  it("define el campo token_version para revocación de sesiones", () => {
    const hasTokenVersion = schemaContent.includes("token_version");
    ok(hasTokenVersion, "Debe definir la columna token_version en admin_users");
  });

  it("define la tabla admin_login_attempts para rate limiting", () => {
    ok(schemaContent.includes("CREATE TABLE IF NOT EXISTS admin_login_attempts"), "Debe definir la tabla admin_login_attempts");
  });

  it("define la tabla admin_audit_log para logs de actividad", () => {
    ok(schemaContent.includes("CREATE TABLE IF NOT EXISTS admin_audit_log"), "Debe definir la tabla admin_audit_log");
  });

  it("define el campo color en banks para el diseño dinámico", () => {
    ok(schemaContent.includes("color"), "Debe definir la columna color en banks");
  });

  it("define la columna card_ids en promotions para tarjeta única", () => {
    ok(
      schemaContent.includes("card_ids"),
      "Debe definir la columna card_ids en promotions (restricción a tarjetas específicas)",
    );
  });

  it("define la tabla merchant_tags para atributos transversales", () => {
    ok(
      schemaContent.includes("CREATE TABLE IF NOT EXISTS merchant_tags"),
      "Debe definir la tabla merchant_tags",
    );
  });

  it("define la tabla de mapeo merchant_tag_map (N:N comercio ↔ tag)", () => {
    ok(
      schemaContent.includes("CREATE TABLE IF NOT EXISTS merchant_tag_map"),
      "Debe definir la tabla merchant_tag_map",
    );
  });

  it("merchant_tag_map limpia asociaciones con ON DELETE CASCADE", () => {
    // La tabla de mapeo usa CASCADE (a diferencia del RESTRICT del resto) para que
    // borrar un tag/comercio no quede bloqueado por sus asociaciones.
    const mapIdx = schemaContent.indexOf("CREATE TABLE IF NOT EXISTS merchant_tag_map");
    ok(mapIdx !== -1, "Debe existir la tabla merchant_tag_map");
    const mapBlock = schemaContent.slice(mapIdx, mapIdx + 400);
    ok(mapBlock.includes("ON DELETE CASCADE"), "merchant_tag_map debe usar ON DELETE CASCADE");
  });
});
