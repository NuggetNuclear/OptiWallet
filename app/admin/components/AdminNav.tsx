"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const NAV = [
  { section: "Base de datos", items: [
    { href: "/admin/data/banks",       label: "Bancos",      icon: "🏦" },
    { href: "/admin/data/cards",       label: "Tarjetas",    icon: "💳" },
    { href: "/admin/data/categories",  label: "Categorías",  icon: "🏷️" },
    { href: "/admin/data/merchants",   label: "Comercios",   icon: "🏪" },
    { href: "/admin/data/promotions",  label: "Promociones", icon: "🎁" },
  ]},
  { section: "Sistema", items: [
    { href: "/admin",       label: "Dashboard",   icon: "📊" },
    { href: "/admin/users", label: "Admins",      icon: "👤" },
  ]},
];

export function AdminNav({ email }: { email: string }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/admin/auth/logout", { method: "POST" });
    router.push("/admin/login");
  }

  return (
    <aside className="admin-sidebar">
      <div className="admin-logo">
        <span>Admin</span>
        <p>OptiWallet</p>
      </div>

      {NAV.map(({ section, items }) => (
        <div key={section}>
          <div className="admin-nav-section">{section}</div>
          {items.map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              className={`admin-nav-link ${pathname === href || (href !== "/admin" && pathname.startsWith(href)) ? "active" : ""}`}
            >
              <span>{icon}</span>
              {label}
            </Link>
          ))}
        </div>
      ))}

      <div style={{ marginTop: "auto", padding: "16px 20px", borderTop: "1px solid var(--line)" }}>
        <p style={{ fontSize: "11px", color: "var(--ink-dim)", marginBottom: "10px", wordBreak: "break-all" }}>
          {email}
        </p>
        <button
          onClick={logout}
          disabled={loggingOut}
          className="admin-btn admin-btn-ghost"
          style={{ width: "100%", justifyContent: "center" }}
        >
          {loggingOut ? "Saliendo…" : "Cerrar sesión"}
        </button>
      </div>
    </aside>
  );
}
