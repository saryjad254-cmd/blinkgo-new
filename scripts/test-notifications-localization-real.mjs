#!/usr/bin/env node
/**
 * Phase 7H-H — Notifications Localization (REAL DB)
 * ─────────────────────────────────────────────────
 * Tests:
 *  - S. Localization
 *  - Arabic (RTL)
 *  - German
 *  - English
 *  - No language mixing
 *  - Special characters
 *  - Event names not leaked as untranslated strings
 */

import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { createClient } = await import('@supabase/supabase-js');
const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

let pass = 0, fail = 0;
const results = [];
function t(name, cond, detail) {
  const status = cond ? 'PASS' : 'FAIL';
  if (cond) pass++; else fail++;
  results.push({ name, status, detail });
  console.log(`${status} ${name}${detail ? ` — ${detail}` : ''}`);
}
function section(name) { console.log(`\n═══ ${name} ═══`); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const TEST_PREFIX = `g7hh_loc_`;
const TS = Date.now();

async function makeUser(label, role = 'customer') {
  const email = `${TEST_PREFIX}${label}_${TS}_${Math.random().toString(36).slice(2, 6)}@test.com`;
  const password = 'TestPass123!';
  const { data: u } = await service.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { name: `User ${label}`, role }
  });
  const id = u?.user?.id;
  await service.from('users').upsert({ id, email, name: `User ${label}`, role, is_active: true }, { onConflict: 'id' });
  return { id, email, password };
}

const createdUsers = [];
async function cleanup() {
  await service.from('notifications').delete().like('title', `${TEST_PREFIX}%`);
  for (const u of createdUsers) {
    await service.from('users').delete().eq('id', u.id);
    await service.auth.admin.deleteUser(u.id).catch(() => null);
  }
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('  PHASE 7H-H — Notifications Localization (REAL DB)');
console.log('═══════════════════════════════════════════════════════════════\n');

// ═══════════════════════════════════════════════════════════════
// S. Arabic (RTL) — store and read correctly
// ═══════════════════════════════════════════════════════════════
section('S. Arabic (RTL) — storage and rendering');
{
  const u = await makeUser('ar');
  createdUsers.push(u);
  
  const arabicStrings = {
    title: 'تحديث الطلب',
    body: 'حالة طلبك تغيرت إلى: مؤكد',
    data: { status: 'مؤكد', note: 'شكراً لطلبك' }
  };
  
  const { data: n, error } = await service.from('notifications').insert({
    user_id: u.id,
    type: 'order',
    ...arabicStrings,
  }).select().single();
  
  t('Arabic: insert succeeds', !error && n?.id, error?.message);
  t('Arabic: title preserved', n?.title === 'تحديث الطلب');
  t('Arabic: body preserved', n?.body === 'حالة طلبك تغيرت إلى: مؤكد');
  t('Arabic: data JSONB preserved', n?.data?.status === 'مؤكد');
  
  // Re-read from DB
  const { data: re } = await service.from('notifications').select('*').eq('id', n.id).single();
  t('Arabic: re-read from DB matches', re?.title === 'تحديث الطلب' && re?.body === 'حالة طلبك تغيرت إلى: مؤكد');
  
  // Check the existing Arabic content
  const { data: existing } = await service.from('notifications').select('*').eq('user_id', u.id);
  t('Arabic: 1 notification in DB', existing?.length === 1);
}

// ═══════════════════════════════════════════════════════════════
// S. German
// ═══════════════════════════════════════════════════════════════
section('S. German');
{
  const u = await makeUser('de');
  createdUsers.push(u);
  
  const germanStrings = {
    title: 'Bestellbestätigung',
    body: 'Deine Bestellung wurde bestätigt',
    data: { status: 'bestätigt' }
  };
  
  const { data: n, error } = await service.from('notifications').insert({
    user_id: u.id,
    type: 'order',
    ...germanStrings,
  }).select().single();
  
  t('German: insert succeeds', !error && n?.id);
  t('German: title preserved', n?.title === 'Bestellbestätigung');
  t('German: body preserved (umlauts)', n?.body === 'Deine Bestellung wurde bestätigt');
}

// ═══════════════════════════════════════════════════════════════
// S. English
// ═══════════════════════════════════════════════════════════════
section('S. English');
{
  const u = await makeUser('en');
  createdUsers.push(u);
  
  const englishStrings = {
    title: 'Order confirmed',
    body: 'Your order has been confirmed',
    data: { status: 'confirmed' }
  };
  
  const { data: n, error } = await service.from('notifications').insert({
    user_id: u.id,
    type: 'order',
    ...englishStrings,
  }).select().single();
  
  t('English: insert succeeds', !error && n?.id);
  t('English: title preserved', n?.title === 'Order confirmed');
  t('English: body preserved', n?.body === 'Your order has been confirmed');
}

// ═══════════════════════════════════════════════════════════════
// S. Special characters
// ═══════════════════════════════════════════════════════════════
section('S. Special characters');
{
  const u = await makeUser('spec');
  createdUsers.push(u);
  
  const special = {
    title: 'Achtung! 🎉 Special: ñ é ü ö ä',
    body: 'Test: < > & " \' @ # $ %',
    data: { emoji: '🚀', special: 'ñ é ü' }
  };
  
  const { data: n, error } = await service.from('notifications').insert({
    user_id: u.id,
    type: 'order',
    ...special,
  }).select().single();
  
  t('Special: emoji preserved', n?.title?.includes('🎉'));
  t('Special: umlauts preserved', n?.title?.includes('ü') && n?.title?.includes('ä'));
  t('Special: HTML chars preserved (component must escape on render)', n?.body?.includes('<') && n?.body?.includes('>'));
  t('Special: emoji in JSONB preserved', n?.data?.emoji === '🚀');
}

// ═══════════════════════════════════════════════════════════════
// S. Long content (multi-line)
// ═══════════════════════════════════════════════════════════════
section('S. Long / multi-line content');
{
  const u = await makeUser('long');
  createdUsers.push(u);
  
  const longBody = 'Dies ist ein langer Text\nüber mehrere Zeilen\nmit Absätzen und Details zum Bestellvorgang.';
  const { data: n } = await service.from('notifications').insert({
    user_id: u.id,
    type: 'order',
    title: `${TEST_PREFIX}long`,
    body: longBody,
    data: { line1: 'A', line2: 'B' }
  }).select().single();
  
  t('Long: multiline preserved', n?.body === longBody);
  t('Long: newlines preserved', n?.body?.includes('\n'));
}

// ═══════════════════════════════════════════════════════════════
// S. Event names not leaked as untranslated strings
// ═══════════════════════════════════════════════════════════════
section('S. No technical event names');
{
  const u = await makeUser('eventnames');
  createdUsers.push(u);
  
  // Check that existing notifications don't have untranslated event names
  // (e.g. "order_confirmed" instead of "Order confirmed")
  const { data: existing } = await service.from('notifications').select('*').limit(50);
  
  // Look for snake_case event names in title
  const untranslated = existing?.filter(n => {
    if (!n.title) return false;
    return /^[\w]+_[\w]+/.test(n.title);  // matches "order_confirmed", "user_registered" etc.
  });
  t('No snake_case event names in title (auto-generated)', (untranslated?.length || 0) === 0, `count: ${untranslated?.length}`);
  
  // Check body too
  const untranslatedBody = existing?.filter(n => {
    if (!n.body) return false;
    return /^[\w]+_[\w]+/.test(n.body);
  });
  t('No snake_case event names in body', (untranslatedBody?.length || 0) === 0, `count: ${untranslatedBody?.length}`);
}

// ═══════════════════════════════════════════════════════════════
// S. RTL detection (Arabic stored correctly)
// ═══════════════════════════════════════════════════════════════
section('S. RTL detection');
{
  const u = await makeUser('rtl');
  createdUsers.push(u);
  
  // Verify Arabic text is stored in UTF-8 (not garbled)
  const { data: n } = await service.from('notifications').insert({
    user_id: u.id,
    type: 'order',
    title: 'طلب',
    body: 'حالة الطلب: جديد',
    data: {}
  }).select().single();
  
  t('RTL: Arabic characters preserved byte-perfect', n?.title === 'طلب');
  t('RTL: Arabic body preserved', n?.body?.includes('حالة'));
  
  // Arabic numerals vs English numerals
  const { data: n2 } = await service.from('notifications').insert({
    user_id: u.id,
    type: 'order',
    title: `${TEST_PREFIX}numerals`,
    body: 'الرقم ٤٥ بالعربي، 45 بالإنجليزي',
    data: { arabic_num: '٤٥', english_num: '45' }
  }).select().single();
  t('RTL: Arabic-Indic numerals preserved', n2?.data?.arabic_num === '٤٥');
  t('RTL: ASCII numerals preserved', n2?.data?.english_num === '45');
}

// ═══════════════════════════════════════════════════════════════
// S. Mixed-script content (transliteration)
// ═══════════════════════════════════════════════════════════════
section('S. Mixed script content');
{
  const u = await makeUser('mixed');
  createdUsers.push(u);
  
  // Test that the system can handle mixed content (restaurant names in Arabic/Latin)
  const { data: n } = await service.from('notifications').insert({
    user_id: u.id,
    type: 'order',
    title: `${TEST_PREFIX}rest_name`,
    body: 'Deine Bestellung bei مطعم kebabhaus ist unterwegs',
    data: { restaurant_name: 'مطعم kebabhaus' }
  }).select().single();
  
  t('Mixed: Arabic+German body preserved', n?.body?.includes('Bestellung') && n?.body?.includes('مطعم'));
  t('Mixed: Arabic+Latin restaurant name in JSONB', n?.data?.restaurant_name === 'مطعم kebabhaus');
}

// ═══════════════════════════════════════════════════════════════
// S. Per-locale notifications (different content for different users)
// ═══════════════════════════════════════════════════════════════
section('S. Per-locale notifications');
{
  const uDe = await makeUser('perDe');
  const uAr = await makeUser('perAr');
  const uEn = await makeUser('perEn');
  createdUsers.push(uDe, uAr, uEn);
  
  // Same event, 3 locales
  const eventId = `same_event_${TS}`;
  await service.from('notifications').insert({
    user_id: uDe.id, type: 'order',
    title: `${TEST_PREFIX}de_confirmed`,
    body: 'Bestellung bestätigt',
    data: { event_id: eventId, locale: 'de' }
  });
  await service.from('notifications').insert({
    user_id: uAr.id, type: 'order',
    title: `${TEST_PREFIX}ar_confirmed`,
    body: 'تم تأكيد الطلب',
    data: { event_id: eventId, locale: 'ar' }
  });
  await service.from('notifications').insert({
    user_id: uEn.id, type: 'order',
    title: `${TEST_PREFIX}en_confirmed`,
    body: 'Order confirmed',
    data: { event_id: eventId, locale: 'en' }
  });
  
  // Each user reads their locale
  const { data: deN } = await service.from('notifications').select('*').eq('user_id', uDe.id).eq('data->>event_id', eventId);
  const { data: arN } = await service.from('notifications').select('*').eq('user_id', uAr.id).eq('data->>event_id', eventId);
  const { data: enN } = await service.from('notifications').select('*').eq('user_id', uEn.id).eq('data->>event_id', eventId);
  
  t('Per-locale: DE has 1', deN?.length === 1);
  t('Per-locale: AR has 1', arN?.length === 1);
  t('Per-locale: EN has 1', enN?.length === 1);
  t('Per-locale: DE body is German', deN?.[0]?.body === 'Bestellung bestätigt');
  t('Per-locale: AR body is Arabic', arN?.[0]?.body === 'تم تأكيد الطلب');
  t('Per-locale: EN body is English', enN?.[0]?.body === 'Order confirmed');
}

// ═══════════════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════════════
section('CLEANUP');
await cleanup();

// ═══════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════
section('SUMMARY');
console.log(`\nTotal: ${pass} pass, ${fail} fail (out of ${pass + fail})`);
console.log(`Pass rate: ${((pass / (pass + fail)) * 100).toFixed(1)}%`);

if (fail > 0) {
  console.log('\n=== Failed tests ===');
  for (const r of results.filter(r => r.status === 'FAIL')) {
    console.log(`  ❌ ${r.name}: ${r.detail || ''}`);
  }
}

process.exit(fail > 0 ? 1 : 0);
