"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminShell } from "./components/AdminShell";

interface Stats {
  promotions: number;
  merchants: number;
  banks: number;
}

const ENTITIES = [
  { href: "/admin/data/banks",      label: "Bancos",      icon: "🏦", desc: "Instituciones financieras" },
  { href: "/admin/data/cards",      label: "Tarjetas",    icon: "💳", desc: "Productos de crédito y débito" },
  { href: "/admin/data/categories", label: "Categorías",  icon: "🏷️", desc: "Categorías de comercios" },
  { href: "/admin/data/merchants",  label: "Comercios",   icon: "🏪", desc: "Tiendas y comercios" },
  { href: "/admin/data/promotions", label: "Promociones", icon: "🎁", desc: "Descuentos y beneficios" },
  { href: "/admin/users",           label: "Admins",      icon: "👤", desc: "Usuarios del panel" },
];

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats").then((r) => r.ok ? r.json() : null).then(setStats);
  }, []);

  return (
    <AdminShell>
      <div className="admin-header">
        <h1 className="admin-title">Dashboard</h1>
      </div>

      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 32 }}>
          {[
            { label: "Promos activas", value: stats.promotions },
            { label: "Comercios",      value: stats.merchants },
            { label: "Bancos",         value: stats.banks },
          ].map(({ label, value }) => (
            <div key={label} className="admin-card" style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 32, fontWeight: 700, color: "var(--lime)" }}>
                {value}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        {ENTITIES.map(({ href, label, icon, desc }) => (
          <Link key={href} href={href} style={{ textDecoration: "none" }}>
            <div className="admin-card" style={{ cursor: "pointer", transition: "border-color 0.15s" }}
                 onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--lime)")}
                 onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--line)")}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
              <div style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 4 }}>{desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </AdminShell>
  );
}
