import assert from 'node:assert/strict';
import { createPublicKey, createVerify, generateKeyPairSync } from 'node:crypto';
import {
  createApnsProviderToken,
  createGoogleServiceAccountAssertion,
} from '../lib/integrations/notifications/provider-jwt.ts';

function decodeSegment(segment) {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

const issuedAt = 1_800_000_000;
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const googleJwt = createGoogleServiceAccountAssertion({
  client_email: 'push-test@blinkgo.example',
  private_key: rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  private_key_id: 'blinkgo-test-key',
}, issuedAt);
const googleParts = googleJwt.split('.');
assert.equal(googleParts.length, 3, 'Google assertion must be a three-part JWT');
assert.deepEqual(decodeSegment(googleParts[0]), { alg: 'RS256', typ: 'JWT', kid: 'blinkgo-test-key' });
assert.deepEqual(decodeSegment(googleParts[1]), {
  iss: 'push-test@blinkgo.example',
  scope: 'https://www.googleapis.com/auth/firebase.messaging',
  aud: 'https://oauth2.googleapis.com/token',
  iat: issuedAt,
  exp: issuedAt + 3600,
});
const googleVerifier = createVerify('RSA-SHA256');
googleVerifier.update(`${googleParts[0]}.${googleParts[1]}`);
googleVerifier.end();
assert.equal(
  googleVerifier.verify(createPublicKey(rsa.privateKey), Buffer.from(googleParts[2], 'base64url')),
  true,
  'Google assertion signature must verify',
);

const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const apnsJwt = createApnsProviderToken({
  keyId: 'ABCDEFGHIJ',
  teamId: '0123456789',
  privateKey: ec.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
}, issuedAt);
const apnsParts = apnsJwt.split('.');
assert.equal(apnsParts.length, 3, 'APNs token must be a three-part JWT');
assert.deepEqual(decodeSegment(apnsParts[0]), { alg: 'ES256', kid: 'ABCDEFGHIJ' });
assert.deepEqual(decodeSegment(apnsParts[1]), { iss: '0123456789', iat: issuedAt });
const apnsSignature = Buffer.from(apnsParts[2], 'base64url');
assert.equal(apnsSignature.length, 64, 'ES256 JWS signatures must use the 64-byte P1363 format');
const apnsVerifier = createVerify('SHA256');
apnsVerifier.update(`${apnsParts[0]}.${apnsParts[1]}`);
apnsVerifier.end();
assert.equal(
  apnsVerifier.verify({ key: ec.publicKey, dsaEncoding: 'ieee-p1363' }, apnsSignature),
  true,
  'APNs token signature must verify',
);

console.log('Push provider JWT regression: PASS (2/2)');
