// src/components/scada/types.ts
export type Role = "operador" | "supervisor" | "mantenimiento" | "admin";

export type Company = {
  id: string;   // ej: "acme"
  name: string; // ej: "ACME S.A."
};

export type User = {
  id: string;
  name: string;     // nombre visible
  role: Role;
  company: Company; // empresa a la que pertenece
};

export type AuditEvent = {
  id: string;
  ts: string; // HH:mm:ss
  user: string;
  role: Role;
  action: string;
  asset?: string;
  details?: string;
  result: "ok" | "denied" | "error";
};

// usuarios “persistidos” (localStorage) para login
export type StoredUser = {
  id: string;
  username: string;   // login
  name: string;       // nombre visible
  role: Role;
  password: string;   // DEMO: en claro
  company: Company;
};
