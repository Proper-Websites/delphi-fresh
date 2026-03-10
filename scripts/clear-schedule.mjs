import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

function parseEnvFile(content) {
  const env = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

async function loadEnv() {
  const envPaths = [path.join(repoRoot, ".env.local"), path.join(repoRoot, ".env")];
  const merged = { ...process.env };
  for (const envPath of envPaths) {
    try {
      const content = await fs.readFile(envPath, "utf8");
      Object.assign(merged, parseEnvFile(content));
    } catch {
      // ignore missing env file
    }
  }
  return merged;
}

async function main() {
  const env = await loadEnv();
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local/.env");
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const updates = [
    supabase.from("my_work_tasks").update({
      task_date: null,
      start_time: null,
      end_time: null,
    }).neq("id", -1),
    supabase.from("calendar_events").update({
      event_date: null,
      start_time: null,
      end_time: null,
      all_day: true,
    }).neq("id", -1),
    supabase.from("sales_outreach").update({
      next_follow_up_date: null,
      next_follow_up_time: null,
    }).neq("id", -1),
    supabase.from("development_projects").update({
      start_date: null,
      deadline: null,
    }).neq("id", -1),
    supabase.from("subscription_clients").update({
      next_billing: null,
      last_revision_date: null,
    }).neq("id", -1),
  ];

  const results = await Promise.all(updates);
  for (const [index, result] of results.entries()) {
    if (result.error) {
      const names = [
        "my_work_tasks",
        "calendar_events",
        "sales_outreach",
        "development_projects",
        "subscription_clients",
      ];
      throw new Error(`${names[index]}: ${result.error.message}`);
    }
  }

  console.log("Cleared schedule dates and times from Supabase:");
  console.log("- my_work_tasks.task_date / start_time / end_time");
  console.log("- calendar_events.event_date / start_time / end_time");
  console.log("- sales_outreach.next_follow_up_date / next_follow_up_time");
  console.log("- development_projects.start_date / deadline");
  console.log("- subscription_clients.next_billing / last_revision_date");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
