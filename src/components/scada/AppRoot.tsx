// src/components/scada/AppRoot.tsx
import React, { useEffect, useState } from "react";
import type { User } from "./types";
import ScadaApp from "./ScadaApp";

// ❌ quitamos el login local
// import { ensureSeedAdmin, findUserByCreds } from "./users";

// Router
import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import InfraestructuraPage from "./pages/InfraestructuraPage";

// 👉 URL del backend (o usa VITE_API_BASE en .env)
const API_BASE = import.meta.env.VITE_API_BASE ?? "https://backend-v85n.onrender.com";

export default function AppRoot() {
  // si querés dejar el seed para dev, comentá o borrá esto:
//  if (typeof window !== "undefined") ensureSeedAdmin();

  const saved = typeof window !== "undefined" ? localStorage.getItem("rdls_user") : null;
  const initial = saved ? (JSON.parse(saved) as User) : null;
  const [user, setUser] = useState<User | null>(initial);

  const loc = useLocation();
  useEffect(() => { console.log("[AppRoot] route change →", loc.pathname); }, [loc.pathname]);

  if (!user) {
    return (
      <LoginScreen
        onLogin={(u: User) => {
          localStorage.setItem("rdls_user", JSON.stringify(u));
          setUser(u);
        }}
      />
    );
  }

  return (
    <Routes>
      <Route path="/infraestructura/*" element={<InfraestructuraPage />} />
      <Route path="/*" element={<ScadaApp initialUser={user} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function decodeJwt(token: string): any {
  try {
    const base64 = token.split(".")[1];
    const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, "=");
    const json = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function LoginScreen({ onLogin }: { onLogin: (u: User) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [orgId, setOrgId] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username || !password || orgId === "") {
      setError("Completá usuario, contraseña y organización.");
      return;
    }

    setLoading(true);
    // limpiamos cualquier token viejo
    localStorage.removeItem("rdls_token");

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, org_id: Number(orgId) }),
      });

      if (!res.ok) {
        let detail = res.statusText;
        try { detail = (await res.json())?.detail ?? detail; } catch {}
        throw new Error(
          res.status === 401
            ? "Usuario o contraseña incorrectos"
            : res.status === 403
            ? "No tenés acceso a esa organización"
            : `Error ${res.status}: ${detail}`
        );
      }

      const data = await res.json(); // { access_token, exp, token_type }
      const token: string = data.access_token;
      localStorage.setItem("rdls_token", token);

      const payload = decodeJwt(token); // { sub, org_id, role, ... }
      const u: User = {
        id: payload.sub ?? 0,
        name: username,                // si luego tenés /auth/me, lo podés actualizar
        role: payload.role ?? "user",
        company: `Org ${payload.org_id ?? ""}`,
      };

      onLogin(u);
    } catch (err: any) {
      setError(err?.message || "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
      <form onSubmit={submit} className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 shadow">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-9 w-9 rounded-lg bg-cyan-600" />
          <div>
            <div className="text-sm text-slate-500">INSTRUMENTACION</div>
            <div className="font-semibold">DIRAC</div>
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-sm block">
            <div className="text-slate-500 mb-1">Usuario</div>
            <input
              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </label>

          <label className="text-sm block">
            <div className="text-slate-500 mb-1">Contraseña</div>
            <input
              type="password"
              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>

          <label className="text-sm block">
            <div className="text-slate-500 mb-1">Organización</div>
            <input
              type="number"
              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200"
              placeholder="ej: 1"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </label>

          {error && <div className="text-xs text-red-600">{error}</div>}

          <button type="submit" className="w-full px-3 py-2 rounded-xl bg-slate-900 text-white" disabled={loading}>
            {loading ? "Ingresando..." : "Ingresar"}
          </button>

          {/* Debug rápido: borralo si no lo querés ver */}
          
        </div>
      </form>
    </div>
  );
}
