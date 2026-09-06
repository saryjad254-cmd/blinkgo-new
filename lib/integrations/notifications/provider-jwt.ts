import { createSign } from 'node:crypto';

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const GOOGLE_TOKEN_AUDIENCE = 'https://oauth2.googleapis.com/token';

export interface GoogleServiceAccountCredentials {
  client_email: string;
  private_key: string;
  private_key_id?: string;
}

export interface ApnsTokenCredentials {
  keyId: string;
  teamId: string;
  privateKey: string;
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function createGoogleServiceAccountAssertion(
  credentials: GoogleServiceAccountCredentials,
  issuedAt = Math.floor(Date.now() / 1000),
): string {
  const header = {
    alg: 'RS256',
    typ: 'JWT',
    ...(credentials.private_key_id ? { kid: credentials.private_key_id } : {}),
  };
  const claims = {
    iss: credentials.client_email,
    scope: FCM_SCOPE,
    aud: GOOGLE_TOKEN_AUDIENCE,
    iat: issuedAt,
    exp: issuedAt + 3600,
  };
  const signingInput = `${encodeJson(header)}.${encodeJson(claims)}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(credentials.private_key).toString('base64url');
  return `${signingInput}.${signature}`;
}

export function createApnsProviderToken(
  credentials: ApnsTokenCredentials,
  issuedAt = Math.floor(Date.now() / 1000),
): string {
  const header = { alg: 'ES256', kid: credentials.keyId };
  const claims = { iss: credentials.teamId, iat: issuedAt };
  const signingInput = `${encodeJson(header)}.${encodeJson(claims)}`;
  const signer = createSign('SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer
    .sign({ key: credentials.privateKey, dsaEncoding: 'ieee-p1363' })
    .toString('base64url');
  return `${signingInput}.${signature}`;
}
