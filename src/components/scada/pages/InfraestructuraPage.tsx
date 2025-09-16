import React, { useEffect, useRef } from "react";

export default function InfraestructuraPage() {
  const isDev = import.meta.env.DEV;
  const src = isDev ? "http://localhost:5174/" : "/infraestructura/";
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let lastH = 0;

    const onMsg = (e: MessageEvent) => {
      if (!e.data || e.data.type !== "EMBED_HEIGHT") return;
      const reported = Number(e.data.height) || 0;

      // al menos el alto de la ventana, para que no quede “cortito”
      const min = window.innerHeight;
      const h = Math.max(reported, min);

      // evita micro-oscilaciones
      if (Math.abs(h - lastH) > 4) {
        iframe.style.height = `${h}px`;
        lastH = h;
      }
    };

    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  return (
    <div style={{ display: "block" }}>
      <iframe
        ref={iframeRef}
        key={src}
        src={src}
        title="Infraestructura"
        // inicia ocupando la ventana; luego se ajusta con postMessage
        style={{ border: "none", width: "100%", height: "100vh", display: "block", overflow: "hidden" }}
        scrolling="no" // <- la barra la maneja la PÁGINA, no el iframe
      />
    </div>
  );
}
