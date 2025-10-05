// Scada/App_Principal/scripts/build-embedded.mjs
import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { cpSync } from "node:fs";

const root = process.cwd(); // App_Principal
const app1 = `${root}/../App_1`;
const app2 = `${root}/../App_2`;

const run = (cmd, cwd) => {
  console.log(`\n▶ ${cmd} (cwd=${cwd})`);
  execSync(cmd, { stdio: "inherit", cwd });
};

// Build App_1
run("npm ci", app1);
run("npm run build", app1);
if (!existsSync(`${root}/public/kpi`)) mkdirSync(`${root}/public/kpi`, { recursive: true });
cpSync(`${app1}/dist`, `${root}/public/kpi`, { recursive: true });

// Build App_2
run("npm ci", app2);
run("npm run build", app2);
if (!existsSync(`${root}/public/infraestructura`)) mkdirSync(`${root}/public/infraestructura`, { recursive: true });
cpSync(`${app2}/dist`, `${root}/public/infraestructura`, { recursive: true });

console.log("\n✅ Embebidas copiadas a /public (kpi/ e infraestructura/)");
