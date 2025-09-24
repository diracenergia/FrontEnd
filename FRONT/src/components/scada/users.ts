// src/components/scada/users.ts
import type { StoredUser, Role, Company } from "./types";

const USERS_KEY = "rdls_users";

export function loadUsers(): StoredUser[] {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || "[]"); }
  catch { return []; }
}

export function saveUsers(users: StoredUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

/** crea un admin semilla para poder entrar la primera vez */
export function ensureSeedAdmin() {
  const users = loadUsers();
  if (!users.some(u => u.role === "admin")) {
    const company: Company = { id: "MRDLS", name: "MRDLS" };
    users.push({
      id: "u_admin",
      username: "admin@acme",
      name: "Administrador",
      role: "admin",
      password: "admin123", // DEMO
      company,
    });
    saveUsers(users);
  }
}

export function findUserByCreds(username: string, password: string) {
  const u = loadUsers().find(u => u.username === username && u.password === password);
  return u || null;
}

export function createUserManual(data: {
  username: string; name: string; role: Role; password: string; companyName: string;
}): StoredUser {
  const users = loadUsers();
  if (users.some(u => u.username === data.username)) throw new Error("Ese usuario ya existe.");
  const company: Company = {
    id: data.companyName.trim().toLowerCase().replace(/\s+/g, "-"),
    name: data.companyName.trim(),
  };
  const nu: StoredUser = {
    id: "u_" + Date.now(),
    username: data.username,
    name: data.name,
    role: data.role,
    password: data.password,
    company,
  };
  users.push(nu);
  saveUsers(users);
  return nu;
}
