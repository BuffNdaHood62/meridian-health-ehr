#!/usr/bin/env node
// Bootstrap the Supabase backend for meridian-health-ehr.
// Usage:  node scripts/bootstrap-supabase.mjs            (local CLI)
//         node scripts/bootstrap-supabase.mjs --cloud    (remote, needs supabase login)
import { execSync } from "node:child_process";
import { existsSync, copyFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const run = (cmd, extra = {}) => {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: ROOT, ...extra });
};

function need(cmd, install) {
  try { execSync(`${cmd} --version`, { stdio: "ignore" }); }
  catch { console.error(`Missing ${cmd}. Install: ${install}`); process.exit(1); }
}

const isCloud = process.argv.includes("--cloud");

need("npx", "node is required");
run("npm install @supabase/supabase-js"); // client lib for the frontend

if (!existsSync(resolve(ROOT, ".env")) && existsSync(resolve(ROOT, ".env.example"))) {
  copyFileSync(resolve(ROOT, ".env.example"), resolve(ROOT, ".env"));
  console.log("Created .env from .env.example — fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");
}

if (isCloud) {
  run("npx supabase login");
  run("npx supabase link --project-ref $SUPABASE_PROJECT_REF");
  run("npx supabase db push");        // applies supabase/migrations in order
} else {
  run("npx supabase start");
  // Local CLI auto-runs migrations + seed on start; re-apply explicitly to be safe.
  run("npx supabase db reset");
}

console.log("\n✓ Supabase backend ready.");
if (isCloud) {
  console.log("Set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env from the Supabase dashboard.");
} else {
  console.log("Local URL: http://127.0.0.1:54323  (Studio)");
}
