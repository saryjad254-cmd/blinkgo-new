#!/usr/bin/env node
import assert from 'node:assert/strict';

Object.assign(process.env, { NODE_ENV: 'production', LOG_LEVEL: 'debug' });

const captured: string[] = [];
const originalError = console.error;
console.error = (...args: unknown[]) => captured.push(args.map(String).join(' '));

async function main() {
  try {
    const { ConsoleLogger } = await import('../lib/foundation/logger');
    const logger = new ConsoleLogger();
    logger.error(
      'provider failure',
      {
        password: 'do-not-print',
        note: 'customer@example.com https://blinkgo.de/reset?token=plain-token&email=customer@example.com',
        authorization_hint: 'Bearer header-is-redacted-by-key',
        safe_field: 'kept',
      },
      new Error('Resend failed for driver@example.com using re_12345678901234567890 and Bearer abc.def.ghi'),
    );
  } finally {
    console.error = originalError;
  }

  assert.equal(captured.length, 1, 'one structured error log expected');
  const line = captured[0];
  assert.doesNotMatch(line, /customer@example\.com|driver@example\.com|do-not-print|plain-token|12345678901234567890|abc\.def\.ghi/);
  assert.match(line, /\[REDACTED_EMAIL\]/);
  assert.match(line, /\[REDACTED\]/);
  assert.match(line, /kept/);

  console.log('Logger redaction: PASS (email, token, provider key, bearer and sensitive-key values)');
}

void main();
