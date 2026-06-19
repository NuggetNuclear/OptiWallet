"""
Scraper — Itaú Beneficios (itaubeneficios.cl)
=============================================
Extrae, por cada beneficio: comercio, % de descuento, tipo de tarjeta,
fecha de inicio y fecha límite (+ categoría y tope como extra).

ESTRUCTURA DEL SITIO:
  /beneficios/beneficios-y-descuentos/ -> CATÁLOGO MAESTRO (todos los comercios)
  /<categoria>/<comercio>/             -> FICHA del comercio (fechas, tope, condiciones)

Requisitos:  pip install requests beautifulsoup4
Uso:         python scraper_itau.py
Salida:      out/itau.import.json  (listo para subir en /admin/ops/import)
             out/itau.raw.json     (datos crudos, para depuración)
"""

import os
import re
import json
import time
import random
import unicodedata
import requests
from datetime import datetime
from urllib.parse import urljoin
from bs4 import BeautifulSoup

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR    = os.path.join(SCRIPT_DIR, "out")
BANK_ID    = "itau"

BASE     = "https://itaubeneficios.cl"
CATALOGO = f"{BASE}/beneficios/beneficios-y-descuentos/"

HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"),
    "Accept-Language": "es-CL,es;q=0.9",
}
TIMEOUT = 20

# Slugs de categoría válidos en la URL (filtra menú/footer/etc.)
CATEGORIAS = {
    "de-compras", "restaurantes", "hogar", "belleza-y-salud", "tiempo-libre",
    "viajes", "educacion", "otros", "sin-categoria",
    "lunes-gourmet", "martes-gourmet", "miercoles-gourmet",
    "jueves-gourmet", "viernes-gourmet", "sabado-gourmet",
}

# Categorías gourmet → días de semana (0=dom … 6=sáb)
GOURMET_DAYS = {
    "lunes-gourmet":     [1],
    "martes-gourmet":    [2],
    "miercoles-gourmet": [3],
    "jueves-gourmet":    [4],
    "viernes-gourmet":   [5],
    "sabado-gourmet":    [6],
}

# Tarjeta → card_types + card_ids del DB
ITAU_CARD = {
    "legend":    {"types": ["credit"], "ids": ["itau-legend"]},
    "black":     {"types": ["credit"], "ids": ["itau-black"]},
    "blue":      {"types": ["credit"], "ids": ["itau-blue"]},
    "signature": {"types": ["credit"], "ids": ["itau-black"]},  # Signature → Black tier
}

# Categoría → modalidad por defecto
MODALITY_HINTS = {
    "viajes":     "online",
    "de-compras": "both",
}

# ---- Expresiones para extraer cada dato (validadas con datos reales) ----
RE_FECHAS  = re.compile(r"[Vv][áa]lido\s+desde\s+(\d{2}-\d{2}-\d{4})\s+hasta(?:\s+el)?\s+(\d{2}-\d{2}-\d{4})")
RE_PCT     = re.compile(r"(\d{1,3})\s*%")
RE_NXN     = re.compile(r"(\d+x\d+)", re.I)
RE_TARJETA = re.compile(r"[Tt]arjeta\s+(Legend|Black|Blue|Signature)", re.I)
RE_TOPE    = re.compile(r"[Tt]ope[^$]*\$\s*([\d\.]+)")


# ---------------------------------------------------------------------------
def get(url, intentos=3):
    """GET con reintentos y pausa. Maneja bloqueos puntuales por bot (403/429)."""
    for i in range(intentos):
        try:
            r = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
            if r.status_code == 200:
                return r
            if r.status_code in (403, 429):
                time.sleep(3 * (i + 1))
                continue
            r.raise_for_status()
        except requests.RequestException:
            time.sleep(2 * (i + 1))
    return None


def _descuento(texto):
    m = RE_PCT.search(texto)
    if m:
        return m.group(1) + "%"
    m = RE_NXN.search(texto)
    return m.group(1) if m else None


# ---------------------------------------------------------------------------
def leer_catalogo():
    """Lee el catálogo maestro. Devuelve comercio, url, categoría, descuento
    y tarjeta (estos dos últimos, tentativos; se confirman en la ficha)."""
    r = get(CATALOGO)
    if not r:
        print("  ⚠ No se pudo leer el catálogo (¿bloqueo?).")
        return []

    soup = BeautifulSoup(r.text, "html.parser")
    items, vistos = [], set()

    # Cada beneficio es un <a> con atributo title y href a /<categoria>/<slug>/
    for a in soup.select("a[href][title]"):
        full = urljoin(BASE, a["href"]).rstrip("/")
        partes = full.split("/")
        if len(partes) < 5:
            continue
        categoria = partes[-2]
        if categoria not in CATEGORIAS:        # descarta menú, footer, etc.
            continue

        url = full + "/"
        if url in vistos:
            continue
        vistos.add(url)

        texto = a.get_text(" ", strip=True)
        tar = RE_TARJETA.search(texto)
        items.append({
            "comercio":  re.sub(r"\s+", " ", a["title"]).strip(),
            "url":       url,
            "categoria": categoria,
            "descuento": _descuento(texto),
            "tarjeta":   tar.group(1).capitalize() if tar else None,
        })
    return items


def enriquecer(item):
    """Entra a la ficha del comercio y agrega fecha_inicio, fecha_limite y tope.
    De paso reconfirma descuento y tarjeta (la ficha es más fiable)."""
    r = get(item["url"])
    if not r:
        item["error"] = "ficha no accesible (posible bloqueo)"
        item.setdefault("fecha_inicio", None)
        item.setdefault("fecha_limite", None)
        return item

    soup = BeautifulSoup(r.text, "html.parser")

    # tarjeta por el alt de la imagen (lo más fiable), antes de limpiar
    tarjeta = None
    for img in soup.find_all("img", alt=True):
        m = RE_TARJETA.search(img["alt"])
        if m:
            tarjeta = m.group(1).capitalize()
            break

    for t in soup(["script", "style", "nav", "header", "footer"]):
        t.decompose()
    texto = soup.get_text(" ", strip=True)

    f = RE_FECHAS.search(texto)
    item["fecha_inicio"] = f.group(1) if f else None   # formato DD-MM-YYYY
    item["fecha_limite"] = f.group(2) if f else None

    item["descuento"] = _descuento(texto) or item.get("descuento")
    if not tarjeta:
        m = RE_TARJETA.search(texto)
        tarjeta = m.group(1).capitalize() if m else None
    item["tarjeta"] = tarjeta or item.get("tarjeta")

    tope = RE_TOPE.search(texto)
    item["tope"] = ("$" + tope.group(1)) if tope else None
    return item


# ── Helpers de conversión al formato ScrapedRow ───────────────────────────────

def slugify(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:40]

def parse_discount(descuento):
    """'10%' → 10   |   '2x1' o None → None (caso borde)."""
    if not descuento:
        return None
    m = re.match(r"^(\d{1,3})%$", str(descuento).strip())
    return int(m.group(1)) if m else None

def parse_tope(tope):
    """'$50.000' → 50000   |   None → None."""
    if not tope:
        return None
    digits = re.sub(r"[^\d]", "", str(tope))
    return int(digits) if digits else None

def parse_date(fecha):
    """'DD-MM-YYYY' → 'YYYY-MM-DD'   |   None → None."""
    if not fecha:
        return None
    parts = str(fecha).split("-")
    if len(parts) != 3 or len(parts[2]) != 4:
        return None
    return f"{parts[2]}-{parts[1]}-{parts[0]}"

def parse_cards(tarjeta):
    """'Legend' → {card_types, card_ids, _source_cards}."""
    if not tarjeta:
        return {"card_types": [], "card_ids": [], "_source_cards": []}
    key  = str(tarjeta).lower()
    card = ITAU_CARD.get(key, {})
    return {
        "card_types":   card.get("types", []),
        "card_ids":     card.get("ids", []),
        "_source_cards": [key] if card else [],
    }

def classify_edge(item):
    """Retorna el tipo de caso borde, o None si es clean."""
    desc_raw = item.get("descuento")
    if not desc_raw:
        return "descuento_no_parseable"
    if re.search(r"\d+\s*x\s*\d+", str(desc_raw), re.I):
        return "2x1_o_segunda_unidad"
    if parse_discount(desc_raw) is None:
        return "descuento_no_parseable"
    return None

def to_import_row(item):
    """Mapea un item crudo del scraper a ScrapedRow (formato /admin/ops/import)."""
    cards = parse_cards(item.get("tarjeta"))
    slug  = slugify(item.get("comercio", ""))
    return {
        "merchant_name":     (item.get("comercio") or "")[:40],
        "merchant_id":       f"NEW:{slug}",
        "discount":          parse_discount(item.get("descuento")),
        "discount_per_unit": None,
        "discount_unit":     None,
        "cap":               parse_tope(item.get("tope")),
        "min_purchase":      None,
        "days_of_week":      GOURMET_DAYS.get(item.get("categoria", ""), []),
        "card_types":        cards["card_types"],
        "card_ids":          cards["card_ids"],
        "_source_cards":     cards["_source_cards"],
        "modality":          MODALITY_HINTS.get(item.get("categoria", ""), "presencial"),
        "start_date":        parse_date(item.get("fecha_inicio")),
        "end_date":          parse_date(item.get("fecha_limite")),
        "stackable":         False,
        "code":              None,
        "conditions":        None,
        "source":            item.get("url") or "",
    }


# ---------------------------------------------------------------------------
def main():
    print("1) Leyendo catálogo maestro…")
    items = leer_catalogo()
    print(f"   {len(items)} comercios encontrados.")

    print("2) Entrando a cada ficha (con pausas)…")
    for i, it in enumerate(items, 1):
        enriquecer(it)
        print(f"   [{i:>3}/{len(items)}] {it['comercio'][:30]:30s} "
              f"{it.get('descuento') or '-':>5} {it.get('tarjeta') or '-':<10} "
              f"{it.get('fecha_inicio') or '?'} → {it.get('fecha_limite') or '?'}")
        time.sleep(random.uniform(0.6, 1.4))

    # Separar clean y casos borde
    clean  = []
    edges  = {}
    for it in items:
        edge = classify_edge(it)
        if edge:
            edges.setdefault(edge, []).append({"name": it.get("comercio"), "url": it.get("url")})
        else:
            clean.append(to_import_row(it))

    edge_counts = {k: len(v) for k, v in edges.items()}
    edge_total  = sum(edge_counts.values())

    # Guardar
    os.makedirs(OUT_DIR, exist_ok=True)

    # Archivo listo para subir a /admin/ops/import
    import_payload = {
        "bank_id":      BANK_ID,
        "generated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "edge_counts":  edge_counts,
        "clean":        clean,
    }
    with open(os.path.join(OUT_DIR, "itau.import.json"), "w", encoding="utf-8") as f:
        json.dump(import_payload, f, ensure_ascii=False, indent=2)

    # Archivo crudo para depuración
    with open(os.path.join(OUT_DIR, "itau.raw.json"), "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)

    print(f"\n=== Resumen ===")
    print(f"Total            {len(items)}")
    print(f"Clean            {len(clean)}")
    print(f"Casos borde      {edge_total}")
    for k, v in sorted(edge_counts.items(), key=lambda x: -x[1]):
        print(f"  - {k:<26} {v}")
    print(f"\nEscrito en {OUT_DIR}/")
    print("Sube out/itau.import.json en /admin/ops/import")


if __name__ == "__main__":
    main()
