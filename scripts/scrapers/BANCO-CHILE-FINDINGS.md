# Scraper Banco de Chile — hallazgos y diseño

Prototipo del adapter de scraping de beneficios bancarios. Corrido sobre los
**786 beneficios reales** del sitio el 2026-06-18.

## 1. El hallazgo que define la arquitectura

La página `sitiospublicos.bancochile.cl/personas/beneficios/categoria` es un
**CMS headless con API JSON público y paginado**. Lo que parecía estar "en cada
página de detalle" en realidad viene **completo en el listado**.

```
GET /api/content/spaces/personas/types/{type}/entries?page=N&per_page=100
```

| type | entries | qué es |
|---|---|---|
| `beneficios` | **786** | el listado real de promos por comercio ← lo que queremos |
| `beneficios-prioridad` | 1 | un contenedor de curaduría (lista de destacados) — ignorar |
| `promociones` | 10 | campañas grandes del mes (otra forma de datos) — tratar aparte |

**Consecuencia:** para Banco de Chile **no se necesita Playwright ni LLM** en el
camino principal. El adapter de fetch es "pagina el API y devuelve JSON", y el
parseo es 100% determinista (regex + mapas). Esto confirma la arquitectura en
capas: *fetch específico por banco, extract genérico, LLM solo como red de
seguridad*.

### Gotcha anti-bot (Imperva/Incapsula)

El dominio está detrás de Imperva. Un `fetch` desde datacenter/CI recibe
`307 → cookie-challenge` y luego `403` con reto JS. El navegador real (y por lo
tanto un Playwright headful, o pasar la cookie `visid_incap_*; incap_ses_*`)
pasa sin problema. El script soporta `BCH_COOKIE` por env, o exporta
`parseEntries()` para alimentarlo desde un navegador. Esta es la única parte
"frágil" del pipeline — exactamente donde anticipábamos el problema.

## 2. Mapeo CMS → tabla `promotions`

| Campo schema | Origen en el CMS | Método |
|---|---|---|
| `bank_id` | constante `banco-chile` | — |
| `merchant_id` | `fields.Titulo` → slug | matching vs `merchants` (pendiente) |
| `discount` | `fields.Tipo Beneficio` (`"40% dto"`) | regex `(\d+)%` |
| `cap` | `Condiciones`/`Descripcion` (`"Tope ... $50.000"`) | regex |
| `min_purchase` | texto de condiciones | regex (fallback) |
| `days_of_week` | `meta.tags` (`domingo`…`sábado`) | mapa directo 0–6 |
| `card_types` / `card_ids` | `fields.Tarjetas Permitidas[]` | mapa de slugs |
| `modality` | `Descripcion` (presencial/online) | heurístico |
| `start_date` / `end_date` | `meta.published_at` / `meta.unpublish_at` | slice ISO |
| `conditions` | `Condiciones Comerciales` | strip HTML |
| `stackable` | texto "no acumulable" | default `false` |
| `source` / `verified_at` | URL del entry / fecha de corrida | — |

## 3. Resultado sobre los 786 reales

```
Total            786
Clean            522   ← candidatos directos a staging
Casos borde      264   ← TODO, manejar más adelante
```

Las 522 limpias extraen descuento, días, fechas, tope y modalidad sin LLM. (El
merchant matching dio 0 resueltos porque el seed actual solo tiene 5 comercios
de juguete; con el catálogo real eso sube — ver §5.)

## 4. Casos borde — TODO (separados, NO manejados aún)

Derivados a `out/banco-chile.edges.json`, agrupados por tipo. Cómo abordarlos:

| Categoría | n | Qué es | Cómo manejarlo después |
|---|---:|---|---|
| `multi_tramo_o_ambiguo` | 144 | "Hasta X%", varios % distintos | descuento variable: guardar como rango o tomar el máximo + flag; aquí entra el LLM |
| `puntos_o_regalo` | 31 | puntos, gift card, canje | mecánica distinta a `discount`; modelar aparte o excluir |
| `descuento_no_parseable` | 26 | `Tipo Beneficio` vacío | leer `Descripcion` con LLM para extraer el % |
| `cuotas_sin_interes` | 47 | financiamiento, no descuento | no es ahorro %; excluir o tipo nuevo |
| `cashback` | 7 | devolución | requiere campo/tipo cashback en el schema |
| `2x1_o_segunda_unidad` | 6 | 2x1, segundo a 50% | mecánica no porcentual; modelar aparte |
| `por_litro` | 3 | combustible/GLP $ por litro | mapea a `discount_per_unit`+`discount_unit` (ya existe en el schema) |

> Nota: las heurísticas de clasificación tienen solape (p.ej. un "4x3 en cine"
> cayó en `cashback` por la palabra "devolución" en su texto). Para un bucket de
> triage manual es aceptable; al automatizarlos conviene afinar con el LLM.

## 5. Limitaciones conocidas / refinamientos

1. **Merchant resolution es el trabajo real pendiente.** Hay que canonicalizar
   ~500 `Titulo` contra la tabla `merchants` (con `aliases`), decidir creación de
   nuevos y deduplicar (un comercio aparece varias veces con promos distintas).
   Hoy todo sale como `NEW:<slug>`.
2. **Granularidad de tarjetas.** El CMS distingue Infinite/Signature/Black/Gold;
   OptiWallet solo modela 2 cards BCh. Colapsamos a `card_types` y guardamos los
   slugs originales en `_source_cards` para cuando el catálogo crezca (caso
   "tarjeta única" del schema).
3. **`start_date` = fecha de publicación del CMS, no de vigencia.** El inicio
   real ("desde el 01 de junio") está en el texto `Vigencia`. `end_date`
   (`unpublish_at`) sí es confiable. Refinamiento: parsear `Vigencia` con regex.
4. **`modality` heurístico** puede sobre-marcar `both` cuando el texto menciona
   un sitio web incidental. Bajo impacto; revisar en staging.

## 6. No escribe a la DB

Por diseño, el output va a `out/*.json`, NO a `promotions`. El flujo previsto:
`scraper → staging → revisión humana en el admin panel → upsert` (con
`verified_at`/`source`). Esto protege un dato que afecta plata del usuario de
alucinaciones y de errores de parseo.

## 7. Correr

```bash
node scripts/scrapers/banco-chile.mjs          # usa fetch directo
BCH_COOKIE="visid_incap_...; incap_ses_..." node scripts/scrapers/banco-chile.mjs
# → out/banco-chile.clean.json  +  out/banco-chile.edges.json
```
