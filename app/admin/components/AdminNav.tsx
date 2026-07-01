"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const NAV = [
  { section: "Operaciones", items: [
    { href: "/admin/ops",         label: "Central"          },
    { href: "/admin/ops/import",  label: "Importar datos"   },
    { href: "/admin/ops/reports", label: "Reportes"         },
  ]},
  { section: "Base de datos", items: [
    { href: "/admin/data/banks",       label: "Bancos"      },
    { href: "/admin/data/cards",       label: "Tarjetas"    },
    { href: "/admin/data/categories",  label: "Categorías"  },
    { href: "/admin/data/tags",        label: "Etiquetas"   },
    { href: "/admin/data/merchants",   label: "Comercios"   },
    { href: "/admin/data/promotions",  label: "Promociones" },
  ]},
  { section: "Sistema", items: [
    { href: "/admin",       label: "Dashboard"            },
    { href: "/admin/users", label: "Administradores"      },
    { href: "/admin/audit", label: "Registro de actividad" },
  ]},
];

const ALL_HREFS = NAV.flatMap((g) => g.items.map((i) => i.href));

export function AdminNav({ email, name }: { email: string; name: string }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [open, setOpen] = useState(false);

  // Solo el href que hace el match MÁS ESPECÍFICO con la ruta actual queda activo.
  // Así /admin/ops (Central) no se ilumina cuando estás en /admin/ops/reports o
  // /admin/ops/import, pero sí en rutas hijas sin item propio (p.ej. /admin/ops/[bankId]).
  const activeHref = ALL_HREFS
    .filter((h) => pathname === h || (h !== "/admin" && pathname.startsWith(h + "/")))
    .sort((a, b) => b.length - a.length)[0];

  function isActive(href: string) {
    return href === activeHref;
  }

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/admin/auth/logout", { method: "POST" });
    router.push("/admin/login");
  }

  return (
    <aside className="admin-sidebar">
      <div className="admin-logo">
        <div className="admin-profile">
          <span className="admin-avatar" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <circle cx="12" cy="8" r="4" fill="#0b0d0c" />
              <path d="M4 20.5c0-4.7 3.8-7.5 8-7.5s8 2.8 8 7.5" fill="#0b0d0c" />
            </svg>
          </span>
          <div className="admin-profile-text">
            <p className="admin-profile-name">{name || "Admin"}</p>
            <p className="admin-profile-email">{email}</p>
          </div>
        </div>
        <button
          type="button"
          className="admin-nav-toggle"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "✕" : "☰"}
        </button>
      </div>

      <nav className={`admin-nav-groups ${open ? "open" : ""}`} onClick={() => setOpen(false)}>
        {NAV.map(({ section, items }) => (
          <div key={section}>
            <div className="admin-nav-section">{section}</div>
            {items.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                className={`admin-nav-link ${isActive(href) ? "active" : ""}`}
              >
                {label}
              </Link>
            ))}
          </div>
        ))}

        <div className="admin-nav-footer">
          <button
            onClick={logout}
            disabled={loggingOut}
            className="admin-btn admin-btn-ghost admin-btn-block"
          >
            {loggingOut ? "Saliendo…" : "Cerrar sesión"}
          </button>
        </div>
      </nav>
    </aside>
  );
}
