/**
 * Apply Database Migrations
 * ─────────────────────────
 * Reads migration SQL files and applies them to the Supabase database.
 * Uses the service-role key to execute DDL.
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const svc = createClient(URL, KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function execSql(sql) {
  // Supabase doesn't have a public exec_sql RPC. We can use PostgREST
  // for table operations or call the management API. As a workaround,
  // we'll try direct DDL via the underlying connection.
  // The simplest approach: use the supabase REST API to call each statement.
  // For production, run migrations via the Supabase SQL editor or `supabase db push`.
  console.log('Note: Supabase JS does not support arbitrary DDL via REST.');
  console.log('Please run this SQL in the Supabase SQL editor:');
  console.log('---');
  console.log(sql);
  console.log('---');
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.log('Usage: node scripts/apply-migrations.js <migration-file>');
    console.log('Example: node scripts/apply-migrations.js lib/supabase/migrations/20260712_v38_ops.sql');
    process.exit(1);
  }
  const file = path.resolve(arg);
  if (!fs.existsSync(file)) {
    console.error('File not found:', file);
    process.exit(1);
  }
  const sql = fs.readFileSync(file, 'utf-8');
  console.log(`Loaded ${sql.length} bytes from ${file}`);

  // Check if we can use pg directly. We need the postgres connection.
  // For now, just print the SQL for manual application.
  await execSql(sql);
}

main().catch(console.error);
