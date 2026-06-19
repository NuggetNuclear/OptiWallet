"""
Scraper — Banco Santander Beneficios
=====================================
https://banco.santander.cl/beneficios

El sitio usa Modyo CMS. Los datos de todas las promociones están disponibles
vía la API paginada de Modyo, sin Playwright:

    GET /beneficios/promociones.json?per_page=50&page=N&custom_fields=true

INSTALACIÓN:
    pip install requests

USO:
    python banco_santander.py

SALIDA:
    out/santander.import.json   → subir en /admin/ops/import
    out/santander.clean.json    → filas limpias (inspección)
    out/santander.edges.json    → casos borde
    out/santander.raw.json      → datos crudos (debug)
"""

import os
import re
import json
import time
import unicodedata
import requests
from datetime import datetime, timezone

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR    = os.path.join(SCRIPT_DIR, "out")
BANK_ID    = "santander"
BASE_URL   = "https://banco.santander.cl"
API_URL    = f"{BASE_URL}/beneficios/promociones.json"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept": "application/json, */*",
    "Accept-Language": "es-CL,es;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "Referer": f"{BASE_URL}/beneficios",
    "X-Requested-With": "XMLHttpRequest",
}

# ---------------------------------------------------------------------------
# Mapas
# ---------------------------------------------------------------------------

# Modyo tag → día de semana (0=Dom … 6=Sáb)
DAY_TAGS: dict[str, int] = {
    "domingo":             0,
    "lunes":               1,
    "martes":              2,
    "miercoles":           3,
    "miercoles-de-sabores": 3,   # también miércoles
    "jueves":              4,
    "viernes":             5,
    "sabado":              6,
}

# Tags → card_types
# credit-only tags
CREDIT_TAGS = {
    "tarjetas-credito", "tarjeta-credito",       # tarjetas de crédito genéricas
    "wm-limited", "exclusivo-limited",            # WorldMember Limited
    "amex", "exclusivo-amex",                     # American Express
    "empresas",                                   # Tarjeta Empresas
    "latam-pass",                                 # LATAM Pass (crédito)
}
# debit-only tags
DEBIT_TAGS = {"tarjetas-debito"}
# both credit + debit
ALL_CARD_TAGS = {"todas-las-tarjetas", "life-y-debito"}

# Meses en español → número
MESES: dict[str, int] = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4,
    "mayo": 5, "junio": 6, "julio": 7, "agosto": 8,
    "septiembre": 9, "octubre": 10,
    "noviembre": 11, "novimbre": 11,   # typo visto en la data real
    "diciembre": 12,
}

# ---------------------------------------------------------------------------
# Regexes
# ---------------------------------------------------------------------------

RE_PCT      = re.compile(r"(\d{1,3})\s*%")
RE_TOPE     = re.compile(r"tope[^$\d]*\$?\s*([\d\.]+)", re.I)
RE_HTML     = re.compile(r"<[^>]+>")
RE_CUOTAS   = re.compile(r"cuota[s]?\s+sin\s+inter[eé]s", re.I)

# ---------------------------------------------------------------------------
# Parseo de fechas en español
# ---------------------------------------------------------------------------

def _to_ymd(day, month_name: str, year) -> str | None:
    month = MESES.get(month_name.strip())
    if not month:
        return None
    try:
        return f"{int(year):04d}-{month:02d}-{int(day):02d}"
    except Exception:
        return None


def parse_vigencia(texto: str) -> tuple[str | None, str | None]:
    """
    Parsea el campo 'Vigencia' de Modyo a (start_date, end_date) en YYYY-MM-DD.

    Patrones manejados:
      "Hasta el 31 de diciembre de 2026."
      "Desde el 1 de junio de 2026 hasta el 31 de agosto de 2026."
      "Desde el 15 al 21 de junio de 2026"
      "Desde el 01 de junio hasta el 31 de agosto"   (sin año → año actual)
      "Desde el 01 de junio al 30 de noviembre de 2026"
    """
    if not texto:
        return None, None

    t = texto.lower().strip().rstrip(".").strip()
    current_year = datetime.now().year

    # ── "Desde [el] DD al DD de MES [de YYYY]" (mismo mes) ─────────────────
    m = re.search(
        r"desde\s+(?:el\s+)?(\d{1,2})\s+al\s+(\d{1,2})\s+de\s+(\w+)(?:\s+de)?\s+(\d{4})", t
    )
    if m:
        return (_to_ymd(m.group(1), m.group(3), m.group(4)),
                _to_ymd(m.group(2), m.group(3), m.group(4)))

    # ── "Desde el DD de MES [de YYYY] hasta [el] DD de MES [de YYYY]" ──────
    m = re.search(
        r"desde\s+el\s+(\d{1,2})\s+de\s+(\w+)(?:\s+de\s+(\d{4}))?"
        r"\s+hasta(?:\s+el)?\s+(\d{1,2})\s+de\s+(\w+)(?:\s+de\s+(\d{4}))?",
        t,
    )
    if m:
        y1 = m.group(3) or str(current_year)
        y2 = m.group(6) or y1
        return (_to_ymd(m.group(1), m.group(2), y1),
                _to_ymd(m.group(4), m.group(5), y2))

    # ── "Desde el DD de MES [de YYYY] al DD de MES [de YYYY]" ──────────────
    m = re.search(
        r"desde\s+el\s+(\d{1,2})\s+de\s+(\w+)(?:\s+de\s+(\d{4}))?"
        r"\s+al\s+(\d{1,2})\s+de\s+(\w+)(?:\s+de\s+(\d{4}))?",
        t,
    )
    if m:
        y1 = m.group(3) or str(current_year)
        y2 = m.group(6) or y1
        return (_to_ymd(m.group(1), m.group(2), y1),
                _to_ymd(m.group(4), m.group(5), y2))

    # ── "Hasta [el] DD de MES [de YYYY]" ────────────────────────────────────
    m = re.search(
        r"hasta(?:\s+el)?\s+(\d{1,2})\s+de\s+(\w+)(?:\s+de\s+(\d{4}))?", t
    )
    if m:
        year = m.group(3) or str(current_year)
        return None, _to_ymd(m.group(1), m.group(2), year)

    return None, None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def slugify(s: str) -> str:
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:40]


def cf(promo: dict, field: str) -> str:
    """Extrae un campo custom de Modyo de forma segura."""
    return str(
        (promo.get("custom_fields") or {}).get(field, {}).get("value") or ""
    ).strip()


# ---------------------------------------------------------------------------
# Extractores de campos
# ---------------------------------------------------------------------------

def get_merchant_name(promo: dict) -> str:
    return str(promo.get("title") or "").strip()[:40]


def get_days(tags: list[str]) -> list[int]:
    """
    Tags específicos de día tienen prioridad.
    Si no hay ninguno → [] (todos los días).
    Nota: algunos ítems tienen 'todos-los-dias' Y un día específico
    (e.g., Madison: todos-los-dias + jueves). El tag de día concreto
    refleja cuándo aplica el descuento; usarlo sobre 'todos-los-dias'.
    """
    days = []
    for tag in tags:
        n = DAY_TAGS.get(tag)
        if n is not None:
            days.append(n)
    return sorted(set(days)) if days else []


def get_card_types(tags: list[str]) -> list[str]:
    types: set[str] = set()
    for tag in tags:
        if tag in CREDIT_TAGS:
            types.add("credit")
        if tag in DEBIT_TAGS:
            types.add("debit")
        if tag in ALL_CARD_TAGS:
            types.add("credit")
            types.add("debit")
    return sorted(types)


def get_discount(bajada: str, tags: list[str]) -> tuple[int | None, str | None]:
    """
    Retorna (pct, edge_type). edge_type es None si el descuento es limpio.

    Orden de clasificación:
    1. Tag cat-cuotas-sin-interes → edge
    2. Texto de bajada con "cuotas sin interés" → edge (fallback sin tag)
    3. Tag cat-multiplica-millas sin % → edge puntos_o_regalo
    4. Bajada vacía → descuento_no_parseable
    5. "Hasta/Desde N%" al inicio → multi_tramo_o_ambiguo
    6. RE_PCT en bajada → clean (o descuento_no_parseable si fuera de rango)
    """
    if "cat-cuotas-sin-interes" in tags:
        return None, "cuotas_sin_interes"

    if RE_CUOTAS.search(bajada):
        return None, "cuotas_sin_interes"

    if "cat-multiplica-millas" in tags:
        if not RE_PCT.search(bajada):
            return None, "puntos_o_regalo"
        # Si tiene % además de millas, usar el % (e.g. "25% dcto. + 1 milla")

    if not bajada:
        return None, "descuento_no_parseable"

    if re.match(r"^\s*(hasta|desde)\s+\d", bajada, re.I):
        return None, "multi_tramo_o_ambiguo"

    m = RE_PCT.search(bajada)
    if not m:
        return None, "descuento_no_parseable"

    pct = int(m.group(1))
    if not (1 <= pct <= 100):
        return None, "descuento_no_parseable"

    return pct, None


def get_cap(bajada: str, description: str) -> int | None:
    combined = f"{bajada} {RE_HTML.sub(' ', description or '')}"
    m = RE_TOPE.search(combined)
    if m:
        digits = re.sub(r"[^\d]", "", m.group(1))
        return int(digits) if digits else None
    return None


def get_modality(description: str) -> str:
    desc = RE_HTML.sub(" ", description or "").lower()
    online     = bool(re.search(
        r"\bonline\b|\bweb\b|\bapp\b|\bdigital\b|\benvío[s]?\b|\benvio[s]?\b", desc
    ))
    presencial = bool(re.search(
        r"\blocal\b|\btienda\b|\bpresencial\b|\brestaurant(?:e)?\b|\bsucursal\b", desc
    ))
    if online and presencial:
        return "both"
    if online:
        return "online"
    return "presencial"


# ---------------------------------------------------------------------------
# Conversión a ScrapedRow
# ---------------------------------------------------------------------------

def to_scraped_row(promo: dict, pct: int) -> dict:
    tags        = promo.get("tags") or []
    bajada      = cf(promo, "Bajada externa")
    vigencia    = cf(promo, "Vigencia")
    description = promo.get("description") or ""
    name        = get_merchant_name(promo)

    start_date, end_date = parse_vigencia(vigencia)

    return {
        "merchant_name":     name,
        "merchant_id":       f"NEW:{slugify(name)}",
        "discount":          pct,
        "discount_per_unit": None,
        "discount_unit":     None,
        "cap":               get_cap(bajada, description),
        "min_purchase":      None,
        "days_of_week":      get_days(tags),
        "card_types":        get_card_types(tags),
        "card_ids":          [],
        "_source_tags":      [t for t in tags if t != "home-disfrutadores"],
        "modality":          get_modality(description),
        "start_date":        start_date,
        "end_date":          end_date,
        "stackable":         False,
        "code":              None,
        "conditions":        cf(promo, "Bajada interna") or None,
        "source":            promo.get("url") or f"{BASE_URL}/beneficios",
    }


# ---------------------------------------------------------------------------
# Descarga paginada
# ---------------------------------------------------------------------------

def fetch_all() -> list[dict]:
    all_promos: list[dict] = []
    per_page   = 50
    page       = 1
    total_pages = 999

    while page <= total_pages:
        url  = f"{API_URL}?per_page={per_page}&page={page}&custom_fields=true"
        resp = requests.get(url, headers=HEADERS, timeout=20)
        resp.raise_for_status()
        data        = resp.json()
        total_pages = data["meta"]["total_pages"]
        batch       = data.get("promociones", [])
        all_promos.extend(batch)
        print(f"  página {page}/{total_pages} → {len(batch)} ítems (acum: {len(all_promos)})")
        page += 1
        if page <= total_pages:
            time.sleep(0.4)

    return all_promos


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    print("=== Scraper Banco Santander Beneficios ===")
    print(f"API: {API_URL}")

    raw = fetch_all()
    print(f"Total descargado: {len(raw)} promociones\n")

    # Guardar raw
    with open(os.path.join(OUT_DIR, "santander.raw.json"), "w", encoding="utf-8") as f:
        json.dump(raw, f, ensure_ascii=False, indent=2)

    clean: list[dict]      = []
    edges: dict[str, list] = {}

    for promo in raw:
        tags   = promo.get("tags") or []
        bajada = cf(promo, "Bajada externa")

        pct, edge_type = get_discount(bajada, tags)

        # Sin tipo de tarjeta reconocido → edge
        if not edge_type and not get_card_types(tags):
            edge_type = "sin_tarjeta_mapeada"

        if edge_type:
            edges.setdefault(edge_type, []).append({
                "name":   get_merchant_name(promo),
                "bajada": bajada,
                "tags":   tags,
            })
        else:
            clean.append(to_scraped_row(promo, pct))

    edge_counts = {k: len(v) for k, v in edges.items()}

    # Guardar outputs
    with open(os.path.join(OUT_DIR, "santander.clean.json"), "w", encoding="utf-8") as f:
        json.dump(clean, f, ensure_ascii=False, indent=2)

    with open(os.path.join(OUT_DIR, "santander.edges.json"), "w", encoding="utf-8") as f:
        json.dump(edges, f, ensure_ascii=False, indent=2)

    import_payload = {
        "bank_id":      BANK_ID,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "edge_counts":  edge_counts,
        "clean":        clean,
    }
    with open(os.path.join(OUT_DIR, "santander.import.json"), "w", encoding="utf-8") as f:
        json.dump(import_payload, f, ensure_ascii=False, indent=2)

    # Resumen
    edge_total = sum(edge_counts.values())
    print("--- Muestra clean (8 filas) ---")
    for row in clean[:8]:
        days_str = str(row["days_of_week"]) if row["days_of_week"] else "[](todos)"
        print(
            f"  {row['merchant_name']:<28} {str(row['discount']) + '%':>5}  "
            f"days={days_str:<12}  cards={row['card_types']}  "
            f"end={row['end_date']}"
        )

    print(f"\n=== Resumen ===")
    print(f"Total raw:     {len(raw)}")
    print(f"Clean:         {len(clean)}")
    print(f"Casos borde:   {edge_total}")
    for k, v in sorted(edge_counts.items(), key=lambda x: -x[1]):
        print(f"  - {k:<28} {v}")
    print(f"\nEscrito en {OUT_DIR}/")
    print("Sube out/santander.import.json en /admin/ops/import")


if __name__ == "__main__":
    main()
