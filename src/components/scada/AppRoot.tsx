// src/components/scada/AppRoot.tsx
import React, { useEffect, useState } from "react";
import type { User } from "./types";
import ScadaApp from "./ScadaApp";
import { ensureSeedAdmin, findUserByCreds } from "./users";

// 👇 ROUTER
import { Routes, Route, useLocation, Navigate } from "react-router-dom";

// 👇 Import correcto de la página (está en este mismo árbol de /scada/pages/)
import InfraestructuraPage from "./pages/InfraestructuraPage";

export default function AppRoot() {
  // asegurar admin semilla
  if (typeof window !== "undefined") ensureSeedAdmin();

  const saved = typeof window !== "undefined" ? localStorage.getItem("rdls_user") : null;
  const initial = saved ? (JSON.parse(saved) as User) : null;
  const [user, setUser] = useState<User | null>(initial);

  // Logs de ruta actuales
  const loc = useLocation();
  useEffect(() => {
    console.log("[AppRoot] route change →", loc.pathname);
  }, [loc.pathname]);

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

  // 👉 Declaramos Rutas:
  // - /infraestructura/* renderiza la mini-app/iframe
  // - /* resto: tu SCADA principal
  return (
    <Routes>
      <Route path="/infraestructura/*" element={<InfraestructuraPage />} />
      <Route path="/*" element={<ScadaApp initialUser={user} />} />
      {/* fallback por si cae algo raro */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function LoginScreen({ onLogin }: { onLogin: (u: User) => void }) {
  const [username, setUsername] = useState("admin@acme");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const su = findUserByCreds(username.trim(), password);
    if (!su) {
      setError("Usuario o contraseña inválidos");
      return;
    }
    onLogin({ id: su.id, name: su.name, role: su.role, company: su.company });
  };

  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
      <form onSubmit={submit} className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 shadow">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-9 w-9 rounded-lg bg-cyan-600" />
          <div>
            <div className="text-sm text-slate-500">SCADA</div>
            <div className="font-semibold">Planta RDLS</div>
          </div>
        </div>
        <div className="space-y-3">
          <label className="text-sm">
            <div className="text-slate-500 mb-1">Usuario</div>
            <input
              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <div className="text-slate-500 mb-1">Contraseña</div>
            <input
              type="password"
              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <div className="text-xs text-red-600">{error}</div>}
          <button type="submit" className="w-full px-3 py-2 rounded-xl bg-slate-900 text-white">
            Ingresar
          </button>
        </div>
      </form>
    </div>
  );
}
