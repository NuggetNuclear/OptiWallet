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
import { NextRequest } from "next/server";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

const normString = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();

type EventLevel = "info" | "warn" | "error" | "success";
type LogEvent = { type: "log"; msg: string; level: EventLevel };
type DoneEvent = { type: "done"; summary: { approved: number; merchants: number; categories: number; errors: string[] } };
type SseEvent = LogEvent | DoneEvent;

export async function POST(req: NextRequest, { params }: { params: Promise<{ bankId: string }> }) {
  const session = await requireAdmin(req);
  if (!session) {
    return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401 });
  }

  const { bankId } = await params;
  if (!isValidId(bankId)) {
    return new Response(JSON.stringify({ error: "bankId inválido" }), { status: 400 });
  }

  const ip = clientIp(req);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function emit(event: SseEvent) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      function log(msg: string, level: EventLevel = "info") {
        emit({ type: "log", msg, level });
      }

      try {
        log(`Iniciando aprobación masiva para banco: "${bankId}"…`);

        const pendingRows = await sql`
          SELECT * FROM promo_staging
          WHERE bank_id = ${bankId} AND status = 'pending'
        ` as any[];

        log(`Se encontraron ${pendingRows.length} promociones pendientes.`);

        if (pendingRows.length === 0) {
          emit({ type: "done", summary: { approved: 0, merchants: 0, categories: 0, errors: [] } });
          controller.close();
          return;
        }

        const dbMerchants = await sql`SELECT id, name, aliases, category_id FROM merchants` as any[];
        const categories  = await sql`SELECT id, label FROM merchant_categories` as any[];

        if (categories.length === 0) {
          log("No existen categorías en la base de datos.", "error");
          emit({ type: "done", summary: { approved: 0, merchants: 0, categories: 0, errors: ["Sin categorías"] } });
          controller.close();
          return;
        }

        const defaultCat = categories.find((c: any) => normString(c.label).includes("otro"))?.id
          ?? categories.find((c: any) => normString(c.label).includes("comida"))?.id
          ?? categories[0].id;

        const localMerchants  = [...dbMerchants];
        const localCategories = [...categories];

        let createdCategoriesCount = 0;
        let createdMerchantsCount  = 0;
        let approvedCount          = 0;
        const errors: string[]     = [];

        // Identify unmatched merchants
        const unmatchedNamesSet = new Set<string>();
        for (const row of pendingRows) {
          if (!row.merchant_id) {
            const rowNorm = normString(row.merchant_name);
            const found = localMerchants.find((m: any) => {
              if (normString(m.name) === rowNorm) return true;
              return Array.isArray(m.aliases) && m.aliases.some((a: string) => normString(a) === rowNorm);
            });
            if (!found) unmatchedNamesSet.add(row.merchant_name.trim());
          }
        }

        const unmatchedNames = Array.from(unmatchedNamesSet);
        if (unmatchedNames.length > 0) {
          log(`${unmatchedNames.length} comercios nuevos sin mapear — consultando IA…`);

          const classifications = await suggestCategoriesBatch(
            unmatchedNames,
            localCategories,
            (msg, level) => log(msg, level ?? "info"),
          );

          for (const name of unmatchedNames) {
            const classResult = classifications.find(
              (c) => normString(c.merchant_name) === normString(name)
            );

            let catId = classResult?.category_id;
            const newCatSuggestion = classResult?.new_category;

            if (newCatSuggestion?.id && newCatSuggestion.label) {
              const catSlug = slugify(newCatSuggestion.id);
              if (!localCategories.some((c: any) => c.id === catSlug)) {
                log(`Nueva categoría: "${newCatSuggestion.label}" (${catSlug})`);
                await sql`
                  INSERT INTO merchant_categories (id, label, emoji)
                  VALUES (${catSlug}, ${newCatSuggestion.label.trim()}, ${newCatSuggestion.emoji || "🛍️"})
                  ON CONFLICT (id) DO NOTHING
                `;
                await logAdminAction(session, "create", "category", catSlug,
                  `Categoría creada automáticamente: ${newCatSuggestion.label}`, ip);
                localCategories.push({ id: catSlug, label: newCatSuggestion.label });
                createdCategoriesCount++;
              }
              catId = catSlug;
            }

            if (!catId || !localCategories.some((c: any) => c.id === catId)) catId = defaultCat;

            const newSlug = slugify(name);
            if (!localMerchants.some((m: any) => m.id === newSlug)) {
              log(`Creando comercio: "${name}" → ${newSlug} [${catId}]`);
              await sql`
                INSERT INTO merchants (id, name, category_id, aliases)
                VALUES (${newSlug}, ${name}, ${catId}, ${[]})
                ON CONFLICT (id) DO NOTHING
              `;
              await logAdminAction(session, "create", "merchant", newSlug,
                `Comercio creado automáticamente: ${name}`, ip);
              localMerchants.push({ id: newSlug, name, aliases: [], category_id: catId });
              createdMerchantsCount++;
            }
          }
        } else {
          log("Todos los comercios ya están mapeados — sin consulta IA necesaria.");
        }

        const toDateStr = (v: unknown): string | null => {
          if (v == null) return null;
          if (v instanceof Date) return v.toISOString().slice(0, 10);
          return String(v).slice(0, 10);
        };

        const today = new Date().toISOString().slice(0, 10);
        log("Insertando promociones en producción…");

        for (const row of pendingRows) {
          try {
            let merchantId = row.merchant_id;
            if (!merchantId) {
              const rowNorm = normString(row.merchant_name);
              const found = localMerchants.find((m: any) => {
                if (normString(m.name) === rowNorm) return true;
                return Array.isArray(m.aliases) && m.aliases.some((a: string) => normString(a) === rowNorm);
              });
              merchantId = found ? found.id : slugify(row.merchant_name);
            }

            if (!localMerchants.some((m: any) => m.id === merchantId)) {
              errors.push(`#${row.id} (${row.merchant_name}): comercio '${merchantId}' no existe`);
              continue;
            }

            const discount          = row.discount as number | null;
            const discount_per_unit = row.discount_per_unit as number | null;
            const discount_unit     = row.discount_unit as string | null;
            const cap               = row.cap as number | null;
            const min_purchase      = row.min_purchase as number | null;
            const days_of_week      = row.days_of_week as number[];
            const card_types        = row.card_types as string[];
            const modality          = (row.modality as string) || "presencial";
            const stackable         = row.stackable as boolean;
            const code              = row.code as string | null;
            const conditions        = row.conditions as string | null;
            const source            = (row.source as string) || "";

            if (!isValidDiscountConfig({ discount, discount_per_unit, discount_unit })) {
              errors.push(`#${row.id} (${row.merchant_name}): descuento inválido`); continue;
            }
            // card_types puede ser [] (aplica a cualquier tarjeta)
            const VALID_TYPES = new Set(["credit", "debit", "prepaid"]);
            if (!Array.isArray(card_types) || card_types.some((t) => !VALID_TYPES.has(t as string))) {
              errors.push(`#${row.id} (${row.merchant_name}): tipo de tarjetas inválido`); continue;
            }
            if (!["presencial", "online", "both"].includes(modality)) {
              errors.push(`#${row.id} (${row.merchant_name}): modalidad inválida`); continue;
            }
            if (!isValidDaysOfWeek(days_of_week)) {
              errors.push(`#${row.id} (${row.merchant_name}): días inválidos`); continue;
            }
            if (!isNonNegativeIntOrNull(cap) || !isNonNegativeIntOrNull(min_purchase)) {
              errors.push(`#${row.id} (${row.merchant_name}): montos inválidos`); continue;
            }
            const sd = row.start_date ? toDateStr(row.start_date) : null;
            const ed = row.end_date   ? toDateStr(row.end_date)   : null;
            if (!isValidDateOrNull(sd) || !isValidDateOrNull(ed)) {
              errors.push(`#${row.id} (${row.merchant_name}): fechas inválidas`); continue;
            }

            const newPromoId = promoId(bankId, merchantId, row.fingerprint as string);
            const dupe = await sql`SELECT id FROM promotions WHERE id = ${newPromoId}`;

            if (dupe.length === 0) {
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

            await sql`
              UPDATE promo_staging
              SET status = 'approved', merchant_id = ${merchantId}, created_promo_id = ${newPromoId},
                  reviewed_at = now(), reviewed_by = ${session.email}
              WHERE id = ${Number(row.id)}
            `;

            const label = discount != null ? `${discount}%` : `$${discount_per_unit}/L`;
            await logAdminAction(session, "approve", "promotion", newPromoId,
              `Aprobación masiva: ${label} en ${merchantId} (${bankId})`, ip);

            approvedCount++;
            if (approvedCount % 10 === 0 || approvedCount === pendingRows.length) {
              log(`Progreso: ${approvedCount}/${pendingRows.length} promociones aprobadas…`);
            }
          } catch (rowErr) {
            errors.push(`#${row.id} (${row.merchant_name}): ${rowErr instanceof Error ? rowErr.message : String(rowErr)}`);
          }
        }

        log(
          `Completado: ${approvedCount} aprobadas, ${createdMerchantsCount} comercios, ` +
          `${createdCategoriesCount} categorías${errors.length ? `, ${errors.length} errores` : ""}.`,
          errors.length ? "warn" : "success",
        );

        emit({ type: "done", summary: { approved: approvedCount, merchants: createdMerchantsCount, categories: createdCategoriesCount, errors } });
      } catch (err) {
        log(`Error fatal: ${err instanceof Error ? err.message : String(err)}`, "error");
        emit({ type: "done", summary: { approved: 0, merchants: 0, categories: 0, errors: [String(err)] } });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
