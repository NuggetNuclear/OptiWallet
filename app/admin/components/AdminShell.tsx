"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminNav } from "./AdminNav";

interface Session { id: string; email: string; totp_enabled: boolean }

export function AdminShell({ children }: { children: React.ReactNode }) {
  const router            = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Session | null) => {
        if (!data) {
          router.replace("/admin/login");
        } else if (!data.totp_enabled) {
          router.replace("/admin/totp-setup");
        } else {
          setSession(data);
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh" }}>
        <span style={{ color: "var(--ink-dim)", fontSize: 13 }}>Verificando sesión…</span>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="admin-shell">
      <AdminNav email={session.email} />
      <main className="admin-main">{children}</main>
    </div>
  );
}
