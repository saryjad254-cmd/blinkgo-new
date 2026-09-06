#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('lib/diagnostic.ts', 'utf8');

assert.match(source, /LOG_OAUTH_TRACE === ['"]true['"]/, 'normal-flow auth tracing must be opt-in');
assert.match(source, /if \(!VERBOSE_ENABLED && !isFailure\) return/, 'failures must remain visible when verbose tracing is off');
assert.match(source, /if \(isFailure\)[\s\S]*console\.error/, 'genuine auth failures must use the error channel');
assert.match(source, /else[\s\S]*console\.info/, 'opt-in normal auth traces must use the info channel');
assert.doesNotMatch(source, /console\.error\([\s\S]{0,100}redirect_to_(?:login|welcome)/, 'normal redirects must not be emitted as errors');

console.log('Auth observability contract: PASS (5/5)');
