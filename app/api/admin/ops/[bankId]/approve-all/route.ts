import { sql } from "@/lib/db";
import { requireAdmin, clientIp } from "@/lib/admin-guard";
import { logAdminAction } from "@/lib/admin-log";
import {
  isValidId,
  isValidCardTypes,
  isValidDaysOfWeek,
  isNonNegativeIntOrNull,
  isValidDateOrNull,
  isValidDiscountConfig,
} from "@/lib/validate";
import { promoId, slugify } from "@/lib/staging";
import { suggestCategoriesBatch } from "@/lib/ai/merchant-suggest";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };

const normString = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();

export async function POST(req: NextRequest, { params }: { params: Promise<{ bankId: string }> }) {
  const session = await requireAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }

  const { bankId } = await params;
  if (!isValidId(bankId)) {
    return NextResponse.json({ error: "bankId inválido" }, { status: 400, headers: NO_CACHE });
  }

  try {
    console.log(`[Approve All] Iniciando aprobación masiva para banco: "${bankId}"...`);

    // 1. Obtener todas las promos pendientes en staging para este banco
    const pendingRows = await sql`
      SELECT * FROM promo_staging
      WHERE bank_id = ${bankId} AND status = 'pending'
    ` as any[];

    console.log(`[Approve All] Se encontraron ${pendingRows.length} promociones pendientes en staging.`);

    if (pendingRows.length === 0) {
      return NextResponse.json({
        message: "No hay promociones pendientes en staging para este banco.",
        approvedCount: 0,
        createdMerchantsCount: 0,
        createdCategoriesCount: 0,
      }, { status: 200, headers: NO_CACHE });
    }

    // 2. Obtener catálogos de la base de datos para mapeo/resolución local
    const dbMerchants = await sql`SELECT id, name, aliases, category_id FROM merchants` as any[];
    const categories = await sql`SELECT id, label FROM merchant_categories` as any[];

    if (categories.length === 0) {
      return NextResponse.json({ error: "No existen categorías en la base de datos." }, { status: 500, headers: NO_CACHE });
    }

    // Encontrar categoría por defecto ('otros', 'comida', o la primera disponible)
    const defaultCat = categories.find((c) => normString(c.label).includes("otro"))?.id
      ?? categories.find((c) => normString(c.label).includes("comida"))?.id
      ?? categories[0].id;

    // Clonar listas locales para ir agregando elementos creados en caliente
    const localMerchants = [...dbMerchants];
    const localCategories = [...categories];

    let createdCategoriesCount = 0;
    let createdMerchantsCount = 0;
    let approvedCount = 0;
    const errors: string[] = [];

    // 3. Identificar comercios que requieren mapeo/resolución
    const unmatchedNamesSet = new Set<string>();
    for (const row of pendingRows) {
      if (!row.merchant_id) {
        const rowNormName = normString(row.merchant_name);
        const found = localMerchants.find((m) => {
          if (normString(m.name) === rowNormName) return true;
          if (Array.isArray(m.aliases)) {
            return m.aliases.some((alias: string) => normString(alias) === rowNormName);
          }
          return false;
        });
        if (!found) {
          unmatchedNamesSet.add(row.merchant_name.trim());
        }
      }
    }

    const unmatchedNames = Array.from(unmatchedNamesSet);
    console.log(`[Approve All] Se detectaron ${unmatchedNames.length} comercios nuevos sin mapear en la base de datos.`);

    // 4. Si hay comercios no mapeados, consultar categoría e insertar de forma masiva (batches)
    if (unmatchedNames.length > 0) {
      console.log(`[Approve All] Solicitando sugerencias de categorías para los ${unmatchedNames.length} comercios nuevos...`);
      const classifications = await suggestCategoriesBatch(unmatchedNames, localCategories);

      console.log(`[Approve All] Procesando clasificaciones sugeridas e insertando comercios...`);
      for (const name of unmatchedNames) {
        const classResult = classifications.find(
          (c) => normString(c.merchant_name) === normString(name)
        );

        let catId = classResult?.category_id;
        const newCatSuggestion = classResult?.new_category;

        // Crear nueva categoría sugerida por el modelo si aplica
        if (newCatSuggestion && newCatSuggestion.id && newCatSuggestion.label) {
          const catSlug = slugify(newCatSuggestion.id);
          const catExists = localCategories.some((c) => c.id === catSlug);
          if (!catExists) {
            console.log(`[Approve All] Nueva categoría sugerida detectada: "${newCatSuggestion.label}" (${catSlug}). Creando...`);
            await sql`
              INSERT INTO merchant_categories (id, label, emoji)
              VALUES (${catSlug}, ${newCatSuggestion.label.trim()}, ${newCatSuggestion.emoji || "🛍️"})
              ON CONFLICT (id) DO NOTHING
            `;
            await logAdminAction(
              session,
              "create",
              "category",
              catSlug,
              `Categoría creada automáticamente desde aprobación masiva: ${newCatSuggestion.label}`,
              clientIp(req)
            );
            localCategories.push({ id: catSlug, label: newCatSuggestion.label });
            createdCategoriesCount++;
          }
          catId = catSlug;
        }

        // Validar categoría final o usar default
        if (!catId || !localCategories.some((c) => c.id === catId)) {
          catId = defaultCat;
        }

        // Crear nuevo comercio de forma local/remota
        const newSlug = slugify(name);
        const merchantExists = localMerchants.some((m) => m.id === newSlug);
        if (!merchantExists) {
          console.log(`[Approve All] Creando comercio nuevo: "${name}" con ID: "${newSlug}" bajo categoría: "${catId}"`);
          await sql`
            INSERT INTO merchants (id, name, category_id, aliases)
            VALUES (${newSlug}, ${name}, ${catId}, ${[]})
            ON CONFLICT (id) DO NOTHING
          `;
          await logAdminAction(
            session,
            "create",
            "merchant",
            newSlug,
            `Comercio creado automáticamente en aprobación masiva: ${name}`,
            clientIp(req)
          );
          localMerchants.push({ id: newSlug, name, aliases: [], category_id: catId });
          createdMerchantsCount++;
        }
      }
    }

    // Formateador de fechas
    const toDateStr = (v: unknown): string | null => {
      if (v === null || v === undefined) return null;
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      return String(v).slice(0, 10);
    };

    const today = new Date().toISOString().slice(0, 10);
    console.log(`[Approve All] Iniciando inserción de promociones en promotions y actualización de staging...`);

    // 5. Iterar y procesar la aprobación definitiva de cada fila en staging
    for (const row of pendingRows) {
      try {
        let merchantId = row.merchant_id;

        if (!merchantId) {
          const rowNormName = normString(row.merchant_name);
          const found = localMerchants.find((m) => {
            if (normString(m.name) === rowNormName) return true;
            if (Array.isArray(m.aliases)) {
              return m.aliases.some((alias: string) => normString(alias) === rowNormName);
            }
            return false;
          });
          if (found) {
            merchantId = found.id;
          } else {
            merchantId = slugify(row.merchant_name);
          }
        }

        // Validar que el comercio exista
        const mExists = localMerchants.some((m) => m.id === merchantId);
        if (!mExists) {
          errors.push(`Promo #${row.id} (${row.merchant_name}): Comercio '${merchantId}' no existe.`);
          continue;
        }

        // Obtener valores finales resolviendo overrides
        const discount          = row.discount as number | null;
        const discount_per_unit = row.discount_per_unit as number | null;
        const discount_unit     = row.discount_unit as string | null;
        const cap               = row.cap as number | null;
        const min_purchase      = row.min_purchase as number | null;
        const days_of_week      = row.days_of_week as number[];
        const card_types        = row.card_types as string[];
        const modality          = row.modality as string || "presencial";
        const start_date        = row.start_date;
        const end_date          = row.end_date;
        const stackable         = row.stackable as boolean;
        const code              = row.code as string | null;
        const conditions        = row.conditions as string | null;
        const source            = row.source as string || "";

        // Validaciones del negocio
        if (!isValidDiscountConfig({ discount, discount_per_unit, discount_unit })) {
          errors.push(`Promo #${row.id} (${row.merchant_name}): Descuento inválido.`);
          continue;
        }
        if (!isValidCardTypes(card_types)) {
          errors.push(`Promo #${row.id} (${row.merchant_name}): Tipo de tarjetas inválido.`);
          continue;
        }
        if (!["presencial", "online", "both"].includes(modality)) {
          errors.push(`Promo #${row.id} (${row.merchant_name}): Modalidad inválida.`);
          continue;
        }
        if (!isValidDaysOfWeek(days_of_week)) {
          errors.push(`Promo #${row.id} (${row.merchant_name}): Días de la semana inválidos.`);
          continue;
        }
        if (!isNonNegativeIntOrNull(cap) || !isNonNegativeIntOrNull(min_purchase)) {
          errors.push(`Promo #${row.id} (${row.merchant_name}): Monto cap/mínimo inválido.`);
          continue;
        }

        const sd = start_date ? toDateStr(start_date) : null;
        const ed = end_date ? toDateStr(end_date) : null;
        if (!isValidDateOrNull(sd) || !isValidDateOrNull(ed)) {
          errors.push(`Promo #${row.id} (${row.merchant_name}): Fechas inválidas.`);
          continue;
        }

        // Crear/Verificar ID único de promoción
        const newPromoId = promoId(bankId, merchantId, row.fingerprint as string);
        const dupe = await sql`SELECT id FROM promotions WHERE id = ${newPromoId}`;

        if (dupe.length === 0) {
          // Insertar en la tabla promotions
          await sql`
            INSERT INTO promotions (
              id, bank_id, card_types, card_ids, merchant_id,
              discount, discount_per_unit, discount_unit, stackable,
              cap, min_purchase, days_of_week, start_date, end_date,
              modality, code, conditions, source, verified_at, active
            ) VALUES (
              ${newPromoId}, ${bankId}, ${card_types}, ${[]}, ${merchantId},
              ${discount ?? null}, ${discount_per_unit ?? null}, ${discount_unit ?? null}, ${stackable ?? false},
              ${cap ?? null}, ${min_purchase ?? null}, ${days_of_week ?? []}, ${sd}, ${ed},
              ${modality}, ${code ?? null}, ${conditions ?? null}, ${source}, ${today}::date, true
            )
          `;
        }

        // Actualizar el estado en staging a 'approved'
        await sql`
          UPDATE promo_staging
          SET status = 'approved', merchant_id = ${merchantId}, created_promo_id = ${newPromoId},
              reviewed_at = now(), reviewed_by = ${session.email}
          WHERE id = ${Number(row.id)}
        `;

        const label = discount != null ? `${discount}%` : `$${discount_per_unit}/L`;
        await logAdminAction(
          session,
          "approve",
          "promotion",
          newPromoId,
          `Aprobación masiva desde staging #${row.id}: ${label} en ${merchantId} (${bankId})`,
          clientIp(req)
        );

        approvedCount++;
        
        if (approvedCount % 20 === 0 || approvedCount === pendingRows.length) {
          console.log(`[Approve All] Progreso de inserción: ${approvedCount}/${pendingRows.length} promociones aprobadas...`);
        }
      } catch (rowErr) {
        console.error(`Error aprobando fila staging #${row.id}:`, rowErr);
        errors.push(`Error en fila #${row.id} (${row.merchant_name}): ${rowErr instanceof Error ? rowErr.message : String(rowErr)}`);
      }
    }

    console.log(
      `[Approve All] Completado: ${approvedCount} aprobadas, ` +
      `${createdMerchantsCount} comercios creados, ` +
      `${createdCategoriesCount} categorías creadas, ` +
      `${errors.length} errores.`
    );

    return NextResponse.json({
      message: `Aprobación masiva completada para ${bankId}.`,
      approvedCount,
      createdMerchantsCount,
      createdCategoriesCount,
      errors: errors.length > 0 ? errors : undefined,
    }, { status: 200, headers: NO_CACHE });

  } catch (err) {
    console.error("POST /api/admin/ops/[bankId]/approve-all failed:", err);
    return NextResponse.json({ error: "Error interno en aprobación masiva." }, { status: 500, headers: NO_CACHE });
  }
}
