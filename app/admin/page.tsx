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
  { href: "/admin/data/banks",      label: "Bancos",               desc: "Instituciones financieras"   },
  { href: "/admin/data/cards",      label: "Tarjetas",             desc: "Productos de crédito y débito" },
  { href: "/admin/data/categories", label: "Categorías",           desc: "Categorías de comercios"     },
  { href: "/admin/data/merchants",  label: "Comercios",            desc: "Tiendas y comercios"         },
  { href: "/admin/data/promotions", label: "Promociones",          desc: "Descuentos y beneficios"     },
  { href: "/admin/users",           label: "Administradores",      desc: "Usuarios del panel"          },
  { href: "/admin/audit",           label: "Registro de actividad", desc: "Últimos 30 días"            },
];

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.ok ? r.json() : null)
      .then(setStats)
      .catch((err) => console.error("Error fetching stats:", err));
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
        {ENTITIES.map(({ href, label, desc }) => (
          <Link key={href} href={href} className="admin-entity-card">
            <div className="admin-entity-label">{label}</div>
            <div className="admin-entity-desc">{desc}</div>
          </Link>
        ))}
      </div>
    </AdminShell>
  );
}
