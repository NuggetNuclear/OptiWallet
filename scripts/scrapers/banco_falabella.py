"""
Scraper — Banco Falabella Beneficios
=====================================
https://www.bancofalabella.cl/descuentos/todos

El sitio es Next.js App Router (SSR). Los datos de todas las tarjetas de
beneficio están embebidos en el RSC payload que devuelve la misma URL cuando
se solicita con Accept: text/x-component — sin JavaScript, sin Playwright.

INSTALACIÓN:
    pip install requests

USO:
    python banco_falabella.py

SALIDA:
    out/banco-falabella.import.json   → subir en /admin/ops/import
    out/banco-falabella.clean.json    → filas limpias (inspección)
    out/banco-falabella.edges.json    → casos borde
    out/banco-falabella.raw.json      → cards crudas (debug)
"""

import os
import re
import json
import unicodedata
import requests
from datetime import datetime, timezone

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR    = os.path.join(SCRIPT_DIR, "out")
BANK_ID    = "falabella"
URL        = "https://www.bancofalabella.cl/descuentos/todos"
BASE_URL   = "https://www.bancofalabella.cl"

HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"),
    "Accept": "text/x-component",
    "Accept-Language": "es-CL,es;q=0.9",
    "Referer": BASE_URL,
}

# ---------------------------------------------------------------------------
# Mapas
# ---------------------------------------------------------------------------

DIA_NUM: dict[str, int] = {
    "domingo": 0,
    "lunes": 1,
    "martes": 2,
    "miércoles": 3, "miercoles": 3,
    "jueves": 4,
    "viernes": 5,
    "sábado": 6, "sabado": 6,
}

ALL_DAYS = list(range(7))

# creditCards values → card_types
CARD_TYPE_MAP: dict[str, str] = {
    "cmr mastercard":                   "credit",
    "cmr mastercard premium":           "credit",
    "cmr mastercard elite":             "credit",
    "tarjeta débito banco falabella":   "debit",
    "tarjeta debito banco falabella":   "debit",
    "tarjeta de débito banco falabella":"debit",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

RE_PCT   = re.compile(r"(\d{1,3})\s*%")
RE_TOPE  = re.compile(r"tope\s*\$?\s*([\d\.]+)", re.I)
RE_CLEAN = re.compile(r"[^\d]")


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:40]


def clean_int(s) -> int | None:
    digits = RE_CLEAN.sub("", str(s or ""))
    return int(digits) if digits else None


def parse_date(s) -> str | None:
    """ISO timestamp → 'YYYY-MM-DD'. Corrects for Chilean timezone offset."""
    if not s:
        return None
    m = re.match(r"(\d{4}-\d{2}-\d{2})", str(s))
    return m.group(1) if m else None


# ---------------------------------------------------------------------------
# Fetch + RSC parse
# ---------------------------------------------------------------------------

def fetch_cards() -> list[dict]:
    """
    Descarga el RSC payload de /descuentos/todos y extrae la lista
    benefitCardsData (array de 200+ tarjetas de beneficio).
    """
    resp = requests.get(URL, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    content = resp.text

    # El RSC payload es un texto multilinea. La línea de datos es la más larga.
    lines = content.split("\n")
    big_line = max(lines, key=len)

    # Los datos están doblemente escapados dentro del HTML/RSC:
    # \"benefitCardsData\":[{\"benefitCard\":...}]
    marker = '\\"benefitCardsData\\":[{'
    idx = big_line.find(marker)
    if idx == -1:
        raise RuntimeError(
            "No se encontró 'benefitCardsData' en el RSC payload. "
            "¿Cambió la estructura de la página?"
        )

    # Extraer un chunk generoso y desescapar
    chunk = big_line[idx - 5 : idx + 400_000]
    unescaped = chunk.replace('\\"', '"').replace('\\\\', '\\').replace('\\/', '/')

    # Encontrar el array ya desescapado
    arr_marker = '"benefitCardsData":['
    idx2 = unescaped.find(arr_marker)
    if idx2 == -1:
        raise RuntimeError("No se pudo desescapar benefitCardsData.")

    arr_start = idx2 + len('"benefitCardsData":')
    depth, end = 0, arr_start
    for i, c in enumerate(unescaped[arr_start:], arr_start):
        if c == "[":
            depth += 1
        elif c == "]":
            depth -= 1
            if depth == 0:
                end = i + 1
                break

    return json.loads(unescaped[arr_start:end])


# ---------------------------------------------------------------------------
# Extracción de campos por card
# ---------------------------------------------------------------------------

def get_merchant_name(card: dict) -> str:
    name = str(card.get("benefitTitle") or "").strip()
    if not name:
        name = str(card.get("benefitCard", {}).get("title") or "").strip()
    return name[:40]


def get_source_url(card: dict) -> str:
    link = str(card.get("benefitCard", {}).get("linkUrl") or "").strip()
    if link.startswith("http"):
        return link
    if link.startswith("/"):
        return BASE_URL + link
    return URL


def get_discount(card: dict) -> tuple[int | None, str | None]:
    """
    Retorna (pct, edge_type).
    edge_type es None si el descuento es limpio.
    """
    bc  = card.get("benefitCard", {})
    top = str(bc.get("topDiscountText") or "").strip()
    center = str(bc.get("centerDiscountText") or "").strip()
    bottom = str(bc.get("bottomDiscountText") or "").strip()

    # Edges por tipo de beneficio no porcentual
    if bottom.lower() in ("cmr puntos", "puntos"):
        return None, "puntos_o_regalo"
    if re.search(r"sin inter[eé]s|cuotas", bottom, re.I) or \
       re.search(r"cuota", center, re.I):
        return None, "cuotas_sin_interes"
    if re.search(r"gratis|maleta|traslado|noche|acceso", center, re.I):
        return None, "descuento_no_parseable"
    if re.search(r"\$\$|\d{3,}(?!\s*%)", center) and "%" not in center:
        return None, "descuento_no_parseable"

    # "Hasta" o "Desde" → ambiguo
    if top.lower() in ("hasta", "desde"):
        return None, "multi_tramo_o_ambiguo"

    # Intentar extraer porcentaje
    m = RE_PCT.search(center)
    if not m:
        # Último recurso: ¿el center es solo un número? (e.g. "40")
        if re.fullmatch(r"\d{1,3}", center.strip()):
            pct = int(center.strip())
            if 1 <= pct <= 100:
                return pct, None
        return None, "descuento_no_parseable"

    pct = int(m.group(1))
    if not (1 <= pct <= 100):
        return None, "descuento_no_parseable"

    return pct, None


def get_cap(card: dict) -> int | None:
    bottom = str(card.get("benefitCard", {}).get("bottomDiscountText") or "").lower()
    if "sin tope" in bottom or bottom in ("descuento", "", "adicional", "en entradas"):
        return None
    m = RE_TOPE.search(bottom)
    if m:
        return clean_int(m.group(1))
    return None


def get_days(card: dict) -> list[int]:
    raw = card.get("benefitCard", {}).get("discountDays") or []
    if not raw or not isinstance(raw, list):
        return []  # todos los días

    days = []
    for d in raw:
        n = DIA_NUM.get(str(d).lower().strip())
        if n is not None:
            days.append(n)

    # Si tiene los 7 días → [] (todos)
    if sorted(days) == sorted(ALL_DAYS):
        return []
    return sorted(set(days))


def get_card_types(card: dict) -> tuple[list[str], list[str]]:
    raw = card.get("creditCards") or []
    types: set[str] = set()
    source: list[str] = []
    for c in raw:
        key = str(c).lower().strip()
        source.append(key)
        ct = CARD_TYPE_MAP.get(key)
        if ct:
            types.add(ct)
    return sorted(types), source


def get_modality(card: dict) -> str:
    desc = str(card.get("benefitCard", {}).get("description") or "").lower()
    online     = bool(re.search(r"\bonline\b|\bapp\b|\bweb\b|\bdigital\b|\bdelivery\b", desc))
    presencial = bool(re.search(r"\bpresencial\b|\btotem\b", desc))
    if online and presencial:
        return "both"
    if online:
        return "online"
    return "presencial"


# ---------------------------------------------------------------------------
# Clasificación + conversión a ScrapedRow
# ---------------------------------------------------------------------------

def to_scraped_row(card: dict, pct: int) -> dict:
    merchant_name = get_merchant_name(card)
    card_types, source_cards = get_card_types(card)
    bc = card.get("benefitCard", {})

    return {
        "merchant_name":     merchant_name,
        "merchant_id":       f"NEW:{slugify(merchant_name)}",
        "discount":          pct,
        "discount_per_unit": None,
        "discount_unit":     None,
        "cap":               get_cap(card),
        "min_purchase":      None,
        "days_of_week":      get_days(card),
        "card_types":        card_types,
        "card_ids":          [],
        "_source_cards":     source_cards,
        "modality":          get_modality(card),
        "start_date":        parse_date(bc.get("initDate")),
        "end_date":          parse_date(bc.get("endDate")),
        "stackable":         False,
        "code":              None,
        "conditions":        str(bc.get("description") or "")[:500] or None,
        "source":            get_source_url(card),
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    print("=== Scraper Banco Falabella Beneficios ===")
    print(f"GET {URL}")

    raw_cards = fetch_cards()
    print(f"Cards recibidas: {len(raw_cards)}")

    # Guardar raw
    with open(os.path.join(OUT_DIR, "banco-falabella.raw.json"), "w", encoding="utf-8") as f:
        json.dump(raw_cards, f, ensure_ascii=False, indent=2)

    clean: list[dict] = []
    edges: dict[str, list] = {}

    for card in raw_cards:
        pct, edge_type = get_discount(card)

        # Verificación de seguridad: sin card_types → edge
        if not edge_type:
            ct, _ = get_card_types(card)
            if not ct:
                edge_type = "sin_tarjeta_mapeada"

        if edge_type:
            edges.setdefault(edge_type, []).append({
                "name":   get_merchant_name(card),
                "top":    card.get("benefitCard", {}).get("topDiscountText"),
                "center": card.get("benefitCard", {}).get("centerDiscountText"),
                "bottom": card.get("benefitCard", {}).get("bottomDiscountText"),
                "cards":  card.get("creditCards"),
            })
        else:
            clean.append(to_scraped_row(card, pct))

    edge_counts = {k: len(v) for k, v in edges.items()}

    # Guardar outputs
    with open(os.path.join(OUT_DIR, "banco-falabella.clean.json"), "w", encoding="utf-8") as f:
        json.dump(clean, f, ensure_ascii=False, indent=2)

    with open(os.path.join(OUT_DIR, "banco-falabella.edges.json"), "w", encoding="utf-8") as f:
        json.dump(edges, f, ensure_ascii=False, indent=2)

    import_payload = {
        "bank_id":      BANK_ID,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "edge_counts":  edge_counts,
        "clean":        clean,
    }
    with open(os.path.join(OUT_DIR, "banco-falabella.import.json"), "w", encoding="utf-8") as f:
        json.dump(import_payload, f, ensure_ascii=False, indent=2)

    # Resumen
    edge_total = sum(edge_counts.values())
    print("\n--- Muestra clean (5 filas) ---")
    for row in clean[:5]:
        days_str = str(row["days_of_week"]) if row["days_of_week"] else "[](todos)"
        print(f"  {row['merchant_name']:<28} {str(row['discount'])+'%':>5}  "
              f"days={days_str}  cards={row['card_types']}  "
              f"cap={row['cap']}  mod={row['modality']}")

    print(f"\n=== Resumen ===")
    print(f"Total raw:         {len(raw_cards)}")
    print(f"Clean:             {len(clean)}")
    print(f"Casos borde:       {edge_total}")
    for k, v in sorted(edge_counts.items(), key=lambda x: -x[1]):
        print(f"  - {k:<28} {v}")
    print(f"\nEscrito en {OUT_DIR}/")
    print("Sube out/banco-falabella.import.json en /admin/ops/import")


if __name__ == "__main__":
    main()
