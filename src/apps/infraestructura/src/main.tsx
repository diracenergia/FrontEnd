// src/main.tsx
import "../src/embed"; // ← IMPORTANTE: instala el listener EMBED_INIT y auto-height ANTES de todo

import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
