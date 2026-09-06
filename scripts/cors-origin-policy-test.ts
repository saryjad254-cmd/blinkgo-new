import assert from 'node:assert/strict';
import { NextRequest, NextResponse } from 'next/server';
import { applyCorsHeaders } from '../lib/security-headers';

const mutableEnv = process.env as Record<string, string | undefined>;

const original = {
  nodeEnv: process.env.NODE_ENV,
  allowedOrigins: process.env.ALLOWED_ORIGINS,
};

function headersFor(origin: string) {
  const request = new NextRequest('https://www.blinkgo.de/api/test', {
    headers: { origin },
  });
  return applyCorsHeaders(request, NextResponse.json({ ok: true })).headers;
}

try {
  mutableEnv.NODE_ENV = 'production';
  process.env.ALLOWED_ORIGINS = 'https://blinkgo.de,https://www.blinkgo.de';

  const configured = headersFor('https://blinkgo.de');
  assert.equal(configured.get('access-control-allow-origin'), 'https://blinkgo.de');
  assert.equal(configured.get('access-control-allow-credentials'), 'true');

  for (const untrusted of [
    'https://attacker.trycloudflare.com',
    'https://attacker.vercel.app',
    'https://blinkgo.de.attacker.example',
  ]) {
    assert.equal(headersFor(untrusted).get('access-control-allow-origin'), null);
  }

  delete process.env.ALLOWED_ORIGINS;
  assert.equal(headersFor('https://attacker.trycloudflare.com').get('access-control-allow-origin'), null);

  mutableEnv.NODE_ENV = 'development';
  assert.equal(
    headersFor('https://local-preview.trycloudflare.com').get('access-control-allow-origin'),
    'https://local-preview.trycloudflare.com',
  );

  console.log('CORS origin policy: PASS (production exact allowlist, development tunnel support)');
} finally {
  if (original.nodeEnv === undefined) delete mutableEnv.NODE_ENV;
  else mutableEnv.NODE_ENV = original.nodeEnv;
  if (original.allowedOrigins === undefined) delete process.env.ALLOWED_ORIGINS;
  else process.env.ALLOWED_ORIGINS = original.allowedOrigins;
}
