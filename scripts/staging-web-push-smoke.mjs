#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import webPush from 'web-push';

const publicKey = String(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '').trim();
const privateKey = String(process.env.VAPID_PRIVATE_KEY ?? '').trim();
const subject = String(process.env.VAPID_SUBJECT ?? '').trim();

assert.ok(publicKey.length >= 80, 'A VAPID public key is required');
assert.ok(privateKey.length >= 40, 'A VAPID private key is required');
assert.match(subject, /^(mailto:|https:\/\/)/, 'A valid VAPID subject is required');

const vapidCurve = createECDH('prime256v1');
vapidCurve.setPrivateKey(Buffer.from(privateKey, 'base64url'));
assert.equal(
  vapidCurve.getPublicKey().toString('base64url'),
  publicKey,
  'The VAPID public and private keys must be a matching pair',
);

const subscriptionCurve = createECDH('prime256v1');
subscriptionCurve.generateKeys();
const request = webPush.generateRequestDetails(
  {
    endpoint: 'https://fcm.googleapis.com/fcm/send/blinkgo-staging-validation',
    keys: {
      p256dh: subscriptionCurve.getPublicKey().toString('base64url'),
      auth: randomBytes(16).toString('base64url'),
    },
  },
  JSON.stringify({ title: 'BlinkGo', body: 'Staging push validation' }),
  {
    TTL: 60,
    vapidDetails: { subject, publicKey, privateKey },
  },
);

assert.equal(request.method, 'POST');
assert.ok(request.headers.Authorization, 'The push request must include VAPID authorization');
assert.ok(request.headers['Content-Encoding'], 'The push payload must be encrypted');
assert.ok(request.body && request.body.length > 0, 'The push request must contain an encrypted body');

console.log('Staging Web Push smoke: PASS (matching key pair, signed authorization, encrypted payload)');
