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
        <div>
          <h1 className="admin-title">Dashboard</h1>
          <p className="admin-subtitle">Resumen y accesos directos del panel</p>
        </div>
      </div>

      {stats && (
        <div className="admin-stats">
          {[
            { label: "Promos activas", value: stats.promotions },
            { label: "Comercios",      value: stats.merchants },
            { label: "Bancos",         value: stats.banks },
          ].map(({ label, value }) => (
            <div key={label} className="admin-card admin-stat">
              <div className="admin-stat-value">{value}</div>
              <div className="admin-stat-label">{label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="admin-entity-grid">
        {ENTITIES.map(({ href, label, icon, desc }) => (
          <Link key={href} href={href} className="admin-entity-card">
            <div className="admin-entity-icon" aria-hidden="true">{icon}</div>
            <div className="admin-entity-label">{label}</div>
            <div className="admin-entity-desc">{desc}</div>
          </Link>
        ))}
      </div>
    </AdminShell>
  );
}
