#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const handlers = new Map();
const focused = [];
const opened = [];
const shown = [];
const self = {
  location: { origin: 'https://www.blinkgo.de' },
  addEventListener: (name, handler) => handlers.set(name, handler),
  skipWaiting: () => undefined,
  clients: {
    claim: async () => undefined,
    matchAll: async () => [{
      url: 'https://www.blinkgo.de/orders/order-1',
      focus: async () => focused.push('order-1'),
    }],
    openWindow: async (url) => opened.push(url),
  },
  registration: {
    showNotification: async (title, options) => shown.push({ title, options }),
  },
};

const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
vm.runInNewContext(source, { self, URL }, { filename: 'public/sw.js' });

async function dispatch(name, event) {
  let completion = Promise.resolve();
  handlers.get(name)({ ...event, waitUntil: (promise) => { completion = Promise.resolve(promise); } });
  await completion;
}

await dispatch('notificationclick', {
  notification: { data: { url: '/orders/order-1' }, close: () => undefined },
});
assert.deepEqual(focused, ['order-1'], 'An already-open matching order window should be focused');
assert.deepEqual(opened, [], 'A second window should not open when a matching client exists');

await dispatch('notificationclick', {
  notification: { data: { url: 'https://attacker.example/phishing' }, close: () => undefined },
});
assert.deepEqual(
  opened,
  ['https://www.blinkgo.de/notifications'],
  'An external notification URL must be replaced by the safe notifications route',
);

await dispatch('push', {
  data: { json: () => ({ title: 'BlinkGo', body: 'Bestellung unterwegs', data: { url: '/orders/order-1' } }) },
});
assert.equal(shown.length, 1, 'A push event should display exactly one notification');
assert.equal(shown[0].options.data.url, '/orders/order-1');

console.log('Service worker push regression: PASS (focus existing, block external URL, show notification)');
