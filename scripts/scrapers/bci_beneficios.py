"""
Scraper — Beneficios BCI
=========================
La API (api.bciplus.cl/bff-loyalty-beneficios/v1/offers) requiere un
subscription key que solo está disponible en el contexto del navegador BCI.
Playwright intercepta las respuestas JSON directamente, sin necesidad de
conocer el key.

INSTALACIÓN (una sola vez):
    pip install playwright
    playwright install chromium

USO:
    python bci_beneficios.py

SALIDA:
    out/bci.import.json   → subir en /admin/ops/import
    out/bci.clean.json    → filas limpias (inspección)
    out/bci.edges.json    → casos borde (revisión manual)
    out/bci.raw.json      → respuestas crudas de la API (debug)
"""

import os
import re
import json
import unicodedata
from datetime import datetime
from playwright.sync_api import sync_playwright

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR    = os.path.join(SCRIPT_DIR, "out")
BANK_ID    = "bci"
API_BASE   = "https://api.bciplus.cl/bff-loyalty-beneficios/v1/offers"
SITIO_URL  = "https://www.bci.cl/beneficios/beneficios-bci"

# ---------------------------------------------------------------------------
# Mapas
# ---------------------------------------------------------------------------

# Días en español → int (0=domingo … 6=sábado)
DIA_NUM: dict[str, int] = {
    "domingo": 0,
    "lunes": 1, "lunes a viernes": 1,  # handled separately below
    "martes": 2,
    "miercoles": 3, "miércoles": 3,
    "jueves": 4,
    "viernes": 5,
    "sabado": 6, "sábado": 6,
}

# tipoOfertaPrincipal que NO son descuento porcentual
TIPO_EDGE: dict[str, str] = {
    "CASHBACK":     "cashback",
    "MULTIPLICADOR":"puntos_o_regalo",
    "PUNTOS":       "puntos_o_regalo",
    "MILLAS":       "puntos_o_regalo",
    "REGALO":       "puntos_o_regalo",
    "CUOTAS":       "cuotas_sin_interes",
    "FINANCIAMIENTO":"cuotas_sin_interes",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

RE_PCT       = re.compile(r"(\d{1,3})\s*%")
RE_TOPE      = re.compile(r"tope[^$\d]*\$?\s*([\d\.]+)", re.I)
RE_MIN_COMPRA= re.compile(r"compras?\s+sobre\s+\$?\s*([\d\.]+)", re.I)
RE_CODIGO    = re.compile(r"c[oó]digo[:\s]+([A-Z0-9]{4,20})", re.I)


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:40]


def clean_int(s) -> int | None:
    """'$50.000' → 50000   |   None → None."""
    digits = re.sub(r"[^\d]", "", str(s or ""))
    return int(digits) if digits else None


def parse_date_iso(s) -> str | None:
    """ISO string (2026-06-30T...) → 'YYYY-MM-DD'   |   None → None."""
    if not s:
        return None
    m = re.match(r"(\d{4}-\d{2}-\d{2})", str(s))
    return m.group(1) if m else None


def nested_get(obj, *keys):
    """Busca la primera key que exista en un dict. Devuelve None si ninguna."""
    if not isinstance(obj, dict):
        return None
    for k in keys:
        if k in obj:
            return obj[k]
    return None

# ---------------------------------------------------------------------------
# Extracción de campos de cada oferta
# ---------------------------------------------------------------------------

def get_merchant_name(entry: dict) -> str:
    """Nombre del comercio (≤40 chars, para slugify y fingerprint)."""
    comercio = entry.get("comercio") or {}
    if isinstance(comercio, dict):
        name = nested_get(comercio, "nombre", "name", "nombreComercio", "title")
        if name:
            return str(name).strip()[:40]
    # Fallback: titulo de la oferta
    return str(entry.get("titulo") or "").strip()[:40]


def get_source_url(entry: dict) -> str:
    """URL estable del beneficio (fuente para aprobación)."""
    link = entry.get("link") or ""
    if link and str(link).startswith("http"):
        return link
    slug = entry.get("slug") or ""
    if slug:
        return f"https://www.bci.cl/beneficios/{slug}"
    return SITIO_URL


def get_discount(entry: dict) -> int | None:
    """Porcentaje de descuento (1–100) o None si no hay/es borde."""
    beneficio = entry.get("beneficio") or {}
    deal      = entry.get("deal") or {}

    # 1) Campo estructurado en beneficio
    for obj in [beneficio, deal]:
        if not isinstance(obj, dict):
            continue
        raw = nested_get(obj,
                         "porcentaje", "descuento", "valor",
                         "discount", "percentage", "porcentajeDescuento")
        if raw is not None:
            try:
                pct = int(float(str(raw).replace("%", "").strip()))
                if 1 <= pct <= 100:
                    return pct
            except (ValueError, TypeError):
                pass

    # 2) Extraer % del título / subtítulo / descripción
    for field in ["titulo", "subtitulo", "descripcion"]:
        m = RE_PCT.search(str(entry.get(field) or ""))
        if m:
            pct = int(m.group(1))
            if 1 <= pct <= 100:
                return pct

    return None


def get_cap(entry: dict) -> int | None:
    """Tope de ahorro en CLP."""
    beneficio = entry.get("beneficio") or {}
    if isinstance(beneficio, dict):
        raw = nested_get(beneficio,
                         "tope", "montoMaximo", "cap",
                         "topeDescuento", "montoTope")
        if raw is not None:
            return clean_int(raw)

    # Fallback: texto de legal/descripcion
    for field in ["legal", "descripcion", "subtitulo"]:
        m = RE_TOPE.search(str(entry.get(field) or ""))
        if m:
            return clean_int(m.group(1))

    return None


def get_min_purchase(entry: dict) -> int | None:
    """Compra mínima en CLP."""
    for field in ["legal", "descripcion", "subtitulo"]:
        m = RE_MIN_COMPRA.search(str(entry.get(field) or ""))
        if m:
            return clean_int(m.group(1))
    return None


def get_days(entry: dict) -> list[int]:
    """
    Días de vigencia como lista de ints (0=dom…6=sáb). [] = todos los días.

    BCI puede modelar los días en el campo 'scheduling' (shape varía).
    Fallback: buscar nombres de días en titulo/subtitulo/descripcion.
    """
    scheduling = entry.get("scheduling") or {}

    if isinstance(scheduling, dict):
        # Shape A: {"dias": ["lunes", "martes"]}
        dias_raw = nested_get(scheduling,
                              "dias", "days", "diasSemana",
                              "daysOfWeek", "diaSemana")
        if dias_raw:
            if isinstance(dias_raw, str):
                dias_raw = [dias_raw]
            days = []
            for d in dias_raw:
                d_low = str(d).lower().strip()
                n = DIA_NUM.get(d_low)
                if n is not None:
                    days.append(n)
            if days:
                return sorted(set(days))

        # Shape B: {"tipo": "TODOS"} o {"todosLosDias": true}
        tipo = str(nested_get(scheduling, "tipo", "type") or "").upper()
        if "TODO" in tipo or "DIARIO" in tipo or scheduling.get("todosLosDias"):
            return []

    # Fallback: parsear texto del titulo/subtitulo
    for field in ["titulo", "subtitulo", "descripcion"]:
        text = str(entry.get(field) or "").lower()

        if "todos los días" in text or "todos los dias" in text or "diario" in text:
            return []
        if "lunes a viernes" in text or "lunes a viernes" in text:
            return [1, 2, 3, 4, 5]

        days = []
        for dia, num in DIA_NUM.items():
            if re.search(rf"\b{re.escape(dia)}\b", text):
                days.append(num)
        if days:
            return sorted(set(days))

    # Sin info de días → todos los días
    return []


def get_card_types(entry: dict) -> tuple[list[str], list[str]]:
    """
    (card_types, _source_cards)
    card_types: subconjunto de ["credit","debit","prepaid"]
    _source_cards: strings crudos del banco
    """
    beneficio = entry.get("beneficio") or {}

    # 1) Campo estructurado
    if isinstance(beneficio, dict):
        raw = nested_get(beneficio,
                         "tarjetas", "tiposTarjeta", "cards",
                         "tipoTarjeta", "tipoCarta")
        if raw:
            if isinstance(raw, str):
                raw = [raw]
            types: set[str] = set()
            source: list[str] = []
            for c in raw:
                s = str(c).lower()
                source.append(s)
                if "cred" in s:
                    types.add("credit")
                if "deb" in s:
                    types.add("debit")
                if "prepago" in s or "prepaid" in s:
                    types.add("prepaid")
            if types:
                return sorted(types), source

    # 2) Texto de legal / descripción
    combined = " ".join(str(entry.get(f) or "")
                        for f in ["legal", "subtitulo", "descripcion", "titulo"])
    types = set()
    source = []
    if re.search(r"cr[eé]dito", combined, re.I):
        types.add("credit")
        source.append("credito")
    if re.search(r"d[eé]bito", combined, re.I):
        types.add("debit")
        source.append("debito")
    if re.search(r"prepago", combined, re.I):
        types.add("prepaid")
        source.append("prepago")

    return sorted(types), source


def get_modality(entry: dict) -> str:
    """presencial | online | both."""
    combined = " ".join(str(entry.get(f) or "")
                        for f in ["legal", "descripcion", "subtitulo", "titulo", "link"]).lower()

    has_online     = bool(re.search(r"\bonline\b|\bapp\b|\bweb\b|\bdigital\b|\bportal\b", combined))
    has_presencial = bool(re.search(r"\bpresencial\b|\btienda\b|\blocal\b|\brestaurante?\b|\bsucursal\b", combined))

    if has_online and has_presencial:
        return "both"
    if has_online:
        return "online"
    return "presencial"


def get_conditions(entry: dict) -> str | None:
    """Texto limpio de condiciones (sin HTML)."""
    raw = str(entry.get("legal") or entry.get("descripcion") or "")
    text = re.sub(r"<[^>]+>", " ", raw)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:500] or None


def get_code(entry: dict) -> str | None:
    """Código promocional si existe."""
    for field in ["legal", "descripcion", "subtitulo"]:
        m = RE_CODIGO.search(str(entry.get(field) or ""))
        if m:
            return m.group(1).upper()
    return None


# ---------------------------------------------------------------------------
# Clasificación de casos borde
# ---------------------------------------------------------------------------

def classify_edge(entry: dict, discount: int | None) -> str | None:
    """Retorna el tipo de borde o None si la fila es clean."""
    tipo = str(entry.get("tipoOfertaPrincipal") or "").upper()

    if tipo in TIPO_EDGE:
        return TIPO_EDGE[tipo]

    # Detectar por texto
    titulo = str(entry.get("titulo") or "").lower()
    if "cashback" in titulo:
        return "cashback"
    if "multiplicad" in titulo or "x5" in titulo or "x3" in titulo or "x2" in titulo:
        return "puntos_o_regalo"
    if re.search(r"\b(cuota|cuotas|sin inter[eé]s)\b", titulo, re.I):
        return "cuotas_sin_interes"
    if re.search(r"\b(puntos|millas|canje|gift card)\b", titulo, re.I):
        return "puntos_o_regalo"
    if re.search(r"\b2x1\b|segunda unidad", titulo, re.I):
        return "2x1_o_segunda_unidad"

    # Sin descuento parseable
    if discount is None:
        return "descuento_no_parseable"

    return None


# ---------------------------------------------------------------------------
# Conversión a ScrapedRow
# ---------------------------------------------------------------------------

def to_scraped_row(entry: dict) -> dict:
    merchant_name  = get_merchant_name(entry)
    merchant_slug  = slugify(merchant_name)
    discount       = get_discount(entry)
    cap            = get_cap(entry)
    min_purchase   = get_min_purchase(entry)
    days           = get_days(entry)
    card_types, source_cards = get_card_types(entry)
    modality       = get_modality(entry)
    conditions     = get_conditions(entry)
    code           = get_code(entry)

    return {
        "merchant_name":     merchant_name,
        "merchant_id":       f"NEW:{merchant_slug}",
        "discount":          discount,
        "discount_per_unit": None,
        "discount_unit":     None,
        "cap":               cap,
        "min_purchase":      min_purchase,
        "days_of_week":      days,
        "card_types":        card_types,
        "card_ids":          [],
        "_source_cards":     source_cards,
        "modality":          modality,
        "start_date":        parse_date_iso(entry.get("fechaInicio")),
        "end_date":          parse_date_iso(entry.get("fechaTermino")),
        "stackable":         False,
        "code":              code,
        "conditions":        conditions,
        "source":            get_source_url(entry),
    }


# ---------------------------------------------------------------------------
# Fetch via Playwright (intercepta la API interna de BCI)
# ---------------------------------------------------------------------------

def _buscar_lista(data) -> list | None:
    """Encuentra la primera lista de dicts dentro de un JSON."""
    if isinstance(data, list) and data and isinstance(data[0], dict):
        return data
    if isinstance(data, dict):
        # Primero buscar por keys conocidas
        for key in ("items", "data", "ofertas", "results", "beneficios"):
            v = data.get(key)
            if isinstance(v, list) and v and isinstance(v[0], dict):
                return v
        # Fallback: primera lista que encuentre
        for v in data.values():
            lista = _buscar_lista(v)
            if lista:
                return lista
    return None


def fetch_all_offers() -> list[dict]:
    """
    Abre el sitio BCI en Playwright, espía todas las respuestas de
    api.bciplus.cl y acumula las listas de ofertas de cada página.
    """
    all_offers: list[dict] = []
    seen_urls: set[str] = set()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(
            user_agent=("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/124.0 Safari/537.36"),
            locale="es-CL",
        )

        def on_response(resp):
            if API_BASE not in resp.url:
                return
            if resp.url in seen_urls:
                return
            seen_urls.add(resp.url)
            try:
                data = resp.json()
            except Exception:
                return
            lista = _buscar_lista(data)
            if lista:
                all_offers.extend(lista)
                # Params de query para el log (e.g. "pagina=2")
                qs = resp.url.split("?", 1)[1] if "?" in resp.url else resp.url
                print(f"  ✓ [{qs}] {len(lista)} ofertas ({len(all_offers)} total)")

        page.on("response", on_response)

        print("Abriendo sitio BCI (interceptando API)…")
        page.goto(SITIO_URL, wait_until="networkidle", timeout=60_000)
        page.wait_for_timeout(3_000)

        # Scroll agresivo para disparar lazy-load de páginas adicionales
        for _ in range(10):
            page.mouse.wheel(0, 4_000)
            page.wait_for_timeout(900)

        page.wait_for_timeout(2_000)
        browser.close()

    print(f"\nTotal ofertas interceptadas: {len(all_offers)}")
    return all_offers


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    print("=== Scraper BCI Beneficios ===")
    raw_offers = fetch_all_offers()

    if not raw_offers:
        print("\nERROR: No se capturaron ofertas.")
        print("Verifica que Playwright esté instalado (pip install playwright && playwright install chromium)")
        return

    # Guardar raw para debug
    raw_path = os.path.join(OUT_DIR, "bci.raw.json")
    with open(raw_path, "w", encoding="utf-8") as f:
        json.dump(raw_offers, f, ensure_ascii=False, indent=2)
    print(f"Guardado: {raw_path}")

    # Mostrar estructura del primer item (para validar mapeo de campos)
    if raw_offers:
        print("\n--- Estructura primer item (debug) ---")
        sample = raw_offers[0]
        for k, v in sample.items():
            preview = json.dumps(v, ensure_ascii=False)[:80] if v is not None else "null"
            print(f"  {k}: {preview}")

    # Parsear y clasificar
    clean: list[dict] = []
    edges: dict[str, list] = {}

    for entry in raw_offers:
        discount   = get_discount(entry)
        edge_type  = classify_edge(entry, discount)

        if edge_type:
            edges.setdefault(edge_type, []).append({
                "name":  get_merchant_name(entry),
                "tipo":  entry.get("tipoOfertaPrincipal"),
                "titulo": entry.get("titulo"),
            })
        else:
            clean.append(to_scraped_row(entry))

    edge_counts = {k: len(v) for k, v in edges.items()}

    # Guardar archivos de salida
    clean_path = os.path.join(OUT_DIR, "bci.clean.json")
    with open(clean_path, "w", encoding="utf-8") as f:
        json.dump(clean, f, ensure_ascii=False, indent=2)

    edges_path = os.path.join(OUT_DIR, "bci.edges.json")
    with open(edges_path, "w", encoding="utf-8") as f:
        json.dump(edges, f, ensure_ascii=False, indent=2)

    import_payload = {
        "bank_id":      BANK_ID,
        "generated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "edge_counts":  edge_counts,
        "clean":        clean,
    }
    import_path = os.path.join(OUT_DIR, "bci.import.json")
    with open(import_path, "w", encoding="utf-8") as f:
        json.dump(import_payload, f, ensure_ascii=False, indent=2)

    # Resumen
    total      = len(raw_offers)
    edge_total = sum(edge_counts.values())

    print("\n--- Muestra clean (5 filas) ---")
    for row in clean[:5]:
        print(f"  {row['merchant_name']:<30} {str(row['discount'])+'%':>5}  "
              f"days={row['days_of_week']}  cards={row['card_types']}  "
              f"cap={row['cap']}  mod={row['modality']}")

    print(f"\n=== Resumen ===")
    print(f"Total raw:         {total}")
    print(f"Clean:             {len(clean)}")
    print(f"Casos borde:       {edge_total}")
    for k, v in sorted(edge_counts.items(), key=lambda x: -x[1]):
        print(f"  - {k:<28} {v}")
    print(f"\nEscrito en {OUT_DIR}/")
    print("Sube out/bci.import.json en /admin/ops/import")


if __name__ == "__main__":
    main()
