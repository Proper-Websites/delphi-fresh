import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const backupRoot = path.join(repoRoot, 'backups', 'supabase');

const tableConfigs = [
  { name: 'sales_outreach', order: [{ column: 'updated_at', ascending: false }] },
  { name: 'sales_page_state', order: [{ column: 'key', ascending: true }] },
  { name: 'development_projects', order: [{ column: 'display_order', ascending: true }, { column: 'updated_at', ascending: false }] },
  { name: 'subscription_clients', order: [{ column: 'display_order', ascending: true }, { column: 'updated_at', ascending: false }] },
  { name: 'my_work_tasks', order: [{ column: 'display_order', ascending: true }, { column: 'updated_at', ascending: false }] },
  { name: 'calendar_events', order: [{ column: 'event_date', ascending: true }, { column: 'display_order', ascending: true }, { column: 'updated_at', ascending: false }] },
];

function parseEnvFile(content) {
  const env = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
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
  const envPaths = [
    path.join(repoRoot, '.env.local'),
    path.join(repoRoot, '.env'),
  ];
  const merged = { ...process.env };
  for (const envPath of envPaths) {
    try {
      const content = await fs.readFile(envPath, 'utf8');
      Object.assign(merged, parseEnvFile(content));
    } catch {
      // ignore missing env file
    }
  }
  return merged;
}

function timestampLabel(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

function toCsv(rows) {
  const columns = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row || {}).forEach((key) => set.add(key));
      return set;
    }, new Set())
  );
  const escape = (value) => {
    if (value === null || value === undefined) return '';
    const normalized = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (/[",\n]/.test(normalized)) {
      return `"${normalized.replace(/"/g, '""')}"`;
    }
    return normalized;
  };
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => escape(row[column])).join(','));
  }
  return lines.join('\n');
}

async function fetchTableRows(supabase, config) {
  const pageSize = 1000;
  let offset = 0;
  const allRows = [];
  while (true) {
    let query = supabase.from(config.name).select('*').range(offset, offset + pageSize - 1);
    for (const order of config.order || []) {
      query = query.order(order.column, { ascending: order.ascending });
    }
    const { data, error } = await query;
    if (error) throw new Error(`${config.name}: ${error.message}`);
    const rows = data ?? [];
    allRows.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return allRows;
}

async function main() {
  const env = await loadEnv();
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = (env.VITE_SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY)?.trim();

  if (!url || !key) {
    throw new Error('Missing VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY in .env.local/.env');
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const backupDir = path.join(backupRoot, timestampLabel());
  const jsonDir = path.join(backupDir, 'json');
  const csvDir = path.join(backupDir, 'csv');
  await fs.mkdir(jsonDir, { recursive: true });
  await fs.mkdir(csvDir, { recursive: true });

  const manifest = {
    createdAt: new Date().toISOString(),
    backupDir,
    source: url,
    tables: [],
  };

  for (const config of tableConfigs) {
    const rows = await fetchTableRows(supabase, config);
    const jsonPath = path.join(jsonDir, `${config.name}.json`);
    const csvPath = path.join(csvDir, `${config.name}.csv`);
    await fs.writeFile(jsonPath, JSON.stringify(rows, null, 2));
    await fs.writeFile(csvPath, toCsv(rows));
    const [jsonStat, csvStat] = await Promise.all([fs.stat(jsonPath), fs.stat(csvPath)]);
    manifest.tables.push({
      table: config.name,
      rowCount: rows.length,
      jsonFile: path.relative(backupDir, jsonPath),
      jsonBytes: jsonStat.size,
      csvFile: path.relative(backupDir, csvPath),
      csvBytes: csvStat.size,
    });
  }

  await fs.writeFile(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await fs.writeFile(
    path.join(backupDir, 'README.txt'),
    [
      'Delphi Supabase Backup',
      `Created: ${manifest.createdAt}`,
      `Source: ${manifest.source}`,
      '',
      'Contents:',
      ...manifest.tables.map((entry) => `- ${entry.table}: ${entry.rowCount} rows | ${entry.jsonFile} | ${entry.csvFile}`),
      '',
      'Restore strategy:',
      '1. Use JSON files for exact re-import.',
      '2. Use CSV files for review in spreadsheet tools.',
    ].join('\n')
  );

  console.log(`Backup created: ${backupDir}`);
  for (const entry of manifest.tables) {
    console.log(`${entry.table}: ${entry.rowCount} rows`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
