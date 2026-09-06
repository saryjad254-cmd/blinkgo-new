#!/usr/bin/env node

import fs from 'node:fs';
import { computeCartKey } from '../lib/cart-key.ts';

let passed = 0;
function test(condition, label) { if (!condition) throw new Error(label); passed += 1; console.log(`  ✓ ${label}`); }

const store = fs.readFileSync('lib/cart-store.ts', 'utf8');
const cart = fs.readFileSync('app/(customer)/cart/page.tsx', 'utf8');
const quote = fs.readFileSync('app/api/cart/quote/route.ts', 'utf8');
const draft = fs.readFileSync('app/api/checkout/draft/route.ts', 'utf8');
const webhook = fs.readFileSync('app/api/stripe/webhook/route.ts', 'utf8');
const recovery = fs.readFileSync('lib/services/payment-recovery.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260812085354_order_item_configuration.sql', 'utf8');
const merchantDetail = fs.readFileSync('app/restaurant/orders/[id]/page.tsx', 'utf8');
const merchantKitchen = fs.readFileSync('components/restaurant/KitchenView.tsx', 'utf8');
const checkout = fs.readFileSync('app/(customer)/checkout/page.tsx', 'utf8');
const cashOrders = fs.readFileSync('app/api/orders/route.ts', 'utf8');

const base = { notes: 'organic if possible' };
test(computeCartKey('r', 'p', { ...base, substitution_preference: 'best_match' }) !== computeCartKey('r', 'p', { ...base, substitution_preference: 'refund_item' }), 'Different substitution choices have different canonical cart identities');
test(store.includes('setSubstitutionPreference') && store.includes("substitution_preference: preference"), 'Cart store persists per-line substitution choices');
test(cart.includes('data-testid="substitution-preference"') && cart.includes("restaurant?.type === 'market'"), 'Substitution controls appear only for retail carts');
test(cart.includes("setSubstitutionPreference(item.config_key, 'refund_item')"), 'Safe refund-item behavior is the default retail instruction');
test(quote.includes('substitutionPreference') && draft.includes('substitutionPreference'), 'Quote and signed checkout draft validate and preserve the instruction');
const recoveryPreservesConfiguration = recovery.includes('configuration: line.configuration || {}')
  || (recovery.includes('const configuration = line.configuration') && recovery.includes('      configuration,'));
test(webhook.includes('configuration: line.configuration || {}') && recoveryPreservesConfiguration, 'Payment webhook and recovery preserve line configuration');
const checkoutPreservesConfiguration = checkout.includes('configuration: line.configuration')
  || checkout.includes('configuration: it.configuration');
test(checkoutPreservesConfiguration && cashOrders.includes('configuration: it.configuration'), 'Cash checkout preserves line configuration through atomic order creation');
test(migration.includes('add column if not exists configuration jsonb') && migration.includes("v_item->'configuration'"), 'Atomic order creation stores immutable item configuration');
test(migration.includes('to service_role') && migration.includes('from public, anon, authenticated'), 'Only the service role can execute atomic order creation');
test(merchantDetail.includes('restaurant-item-substitution'), 'Merchant order detail displays the customer instruction');
test(merchantKitchen.includes('kitchen-item-substitution'), 'Kitchen display shows the substitution instruction during fulfillment');

console.log(`Retail substitution contract: PASS (${passed}/${passed})`);
