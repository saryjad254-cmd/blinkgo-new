import pg from 'pg';
const { Client } = pg;
const candidates = [
  { host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`, port: 5432, user: 'postgres', database: 'postgres' },
  { host: `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co`, port: 6543, user: 'postgres', database: 'postgres' },
  { host: `aws-0-eu-central-1.pooler.supabase.com`, port: 6543, user: `postgres.${process.env.SUPABASE_PROJECT_REF}`, database: 'postgres' },
];
for (const c of candidates) {
  const client = new Client({
    ...c,
    password: process.env.SUPABASE_DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();
    const r = await client.query('SELECT current_user, current_database()');
    console.log('CONNECTED to', c.host + ':' + c.port, '|', r.rows[0]);
    await client.end();
    process.exit(0);
  } catch (e) {
    console.log('FAIL', c.host + ':' + c.port, '|', e.message);
  }
}
console.log('No connection worked.');
