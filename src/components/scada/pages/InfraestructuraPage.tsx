// src/components/scada/pages/InfraestructuraPage.tsx
import React from "react";

export default function InfraestructuraPage() {
  const isDev = import.meta.env.DEV;
  const src = isDev ? "http://localhost:5174/" : "/infraestructura/";

  return (
    <div style={{ height: "100vh", margin: 0, padding: 0 }}>
      <div style={{ padding: "6px 10px", fontSize: 12, color: "#475569" }}>
        <b>Ruta embebida:</b> {src} · <b>Modo:</b> {isDev ? "DEV" : "PROD"}
      </div>
      <iframe
        key={src}                 // fuerza recarga si cambia
        src={src}
        title="Infraestructura"
        style={{ border: "none", width: "100%", height: "calc(100% - 28px)" }}
        onLoad={() => console.log("[Infra] iframe cargado:", src)}
      />
    </div>
  );
}
