import { HashRouter, Routes, Route, Link, Navigate } from "react-router-dom";
import InfraestructuraPage from "./components/scada/pages/InfraestructuraPage";

const BASENAME =
  new URLSearchParams(window.location.search).get("base") ??
  (import.meta as any)?.env?.VITE_ROUTER_BASENAME ??
  ""; // ej: "/embed/scada"

export default function App() {
  return (
    <HashRouter basename={BASENAME}>
      <nav>
        {/* OJO: links relativos cuando usás basename */}
        <Link to="infraestructura">Infraestructura</Link>
      </nav>

      <Routes>
        {/* redirect inicial */}
        <Route path="/" element={<Navigate to="infraestructura" replace />} />

        <Route path="infraestructura" element={<InfraestructuraPage />} />

        {/* catch-all */}
        <Route path="*" element={<Navigate to="infraestructura" replace />} />
      </Routes>
    </HashRouter>
  );
}
