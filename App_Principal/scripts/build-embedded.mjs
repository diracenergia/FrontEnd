// Scada/App_Principal/scripts/build-embedded.mjs
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, cpSync, rmSync } from "node:fs";

const root = process.cwd(); // App_Principal
const app1 = `${root}/../App_1`;
const app2 = `${root}/../App_2`;

const run = (cmd, cwd) => {
  console.log(`\n▶ ${cmd} (cwd=${cwd})`);
  execSync(cmd, { stdio: "inherit", cwd });
};

/**
 * Workaround para optional deps de Rollup entre Windows/Linux:
 * - Borramos package-lock y node_modules de la app embebida
 * - Hacemos npm install (no 'ci') para resolver binarios nativos del SO actual
 */
const cleanInstall = (dir) => {
  try { rmSync(`${dir}/node_modules`, { recursive: true, force: true }); } catch {}
  try { rmSync(`${dir}/package-lock.json`, { force: true }); } catch {}
  run("npm install --no-audit --no-fund", dir);
};

// ==== App_1 (KPIs) ====
cleanInstall(app1);
run("npm run build", app1);
if (!existsSync(`${root}/public/kpi`)) mkdirSync(`${root}/public/kpi`, { recursive: true });
cpSync(`${app1}/dist`, `${root}/public/kpi`, { recursive: true });

// ==== App_2 (Infraestructura) ====
cleanInstall(app2);
run("npm run build", app2);
if (!existsSync(`${root}/public/infraestructura`)) mkdirSync(`${root}/public/infraestructura`, { recursive: true });
cpSync(`${app2}/dist`, `${root}/public/infraestructura`, { recursive: true });

console.log("\n✅ Embebidas copiadas a /public (kpi/ e infraestructura/)");
