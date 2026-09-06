import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  'supabase/migrations/20260826021917_secure_order_tracking_modifications_and_wallet.sql',
  'utf8',
);
const executableSql = sql.replace(/^\s*--.*$/gm, '');

for (const table of ['order_modifications', 'order_tracking_events', 'chat_messages', 'wallet_transactions']) {
  assert.match(sql, new RegExp(`revoke\\s+all\\s+on\\s+table\\s+public\\.${table}\\s+from\\s+anon`, 'i'));
}

assert.match(sql, /revoke insert, update, delete on table public\.order_modifications from authenticated/i);
assert.match(sql, /drop policy if exists modifications_insert/i);
assert.match(sql, /drop policy if exists modifications_update/i);
assert.match(sql, /alter policy modifications_read[\s\S]*?modified_order\.customer_id = \(select auth\.uid\(\)\)/i);
assert.match(sql, /modified_restaurant\.owner_id = \(select auth\.uid\(\)\)/i);

assert.match(sql, /revoke insert, update, delete on table public\.order_tracking_events from authenticated/i);
assert.match(sql, /drop policy if exists tracking_events_insert_driver/i);
assert.match(sql, /drop policy if exists tracking_events_read/i);
assert.match(sql, /tracked_order\.customer_id = \(select auth\.uid\(\)\)/i);
assert.match(sql, /tracked_order\.driver_id = \(select auth\.uid\(\)\)/i);
assert.match(sql, /tracked_restaurant\.owner_id = \(select auth\.uid\(\)\)/i);

assert.match(sql, /alter policy chat_insert[\s\S]*?sender_id = \(select auth\.uid\(\)\)/i);
assert.match(sql, /alter policy chat_read[\s\S]*?receiver_id = \(select auth\.uid\(\)\)/i);
assert.doesNotMatch(executableSql, /auth\.role\(\)/i);

assert.match(sql, /revoke insert, update, delete on table public\.wallet_transactions from authenticated/i);
assert.match(sql, /drop policy if exists wallet_insert/i);
assert.match(sql, /alter policy wallet_user_read[\s\S]*?user_id = \(select auth\.uid\(\)\)/i);
assert.doesNotMatch(executableSql, /(?<!select\s)auth\.uid\(\)/i);

console.log('Order operations RLS contract: PASS (tracking, modifications, chat, wallet)');
