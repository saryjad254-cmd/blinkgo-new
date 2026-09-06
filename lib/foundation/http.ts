/**
 * Foundation: HTTP Utilities
 * ──────────────────────────
 * Cookie helpers, header utilities, IP extraction, CSRF primitives.
 * Replaces ad-hoc helpers scattered throughout the codebase.
 */

import { NextRequest } from 'next/server';

// ── Cookie helpers ─────────────────────────────────────────────
export interface CookieOptions {
  maxAge?: number; // seconds
  expires?: Date;
  path?: string;
  domain?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  priority?: 'low' | 'medium' | 'high';
}

export function buildCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  parts.push(`Path=${options.path ?? '/'}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.secure ?? true) parts.push('Secure');
  if (options.httpOnly ?? true) parts.push('HttpOnly');
  parts.push(`SameSite=${options.sameSite ?? 'Lax'}`);
  return parts.join('; ');
}

export function parseCookies(header: string | null | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  return out;
}

// ── IP extraction ─────────────────────────────────────────────
export function getClientIp(req: NextRequest | Request): string {
  // Order of preference: leftmost XFF, then X-Real-IP, then unique fallback
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;
  // Per-request unique fallback to avoid shared-bucket DoS
  return `anon-${Math.random().toString(36).slice(2, 12)}`;
}

// ── Origin validation (CSRF) ───────────────────────────────────
const LOCALHOST_ORIGINS = new Set([
  'http://localhost',
  'http://localhost/',
  'http://127.0.0.1',
  'http://127.0.0.1/',
]);

const TUNNEL_SUFFIXES = [
  '.loca.lt',
  '.ngrok.io',
  '.ngrok-free.app',
  '.ngrok.app',
  '.trycloudflare.com',
  '.vercel.app',
  '.netlify.app',
  '.githubpreview.dev',
  '.gitpod.io',
  '.serveousercontent.com',
  '.serveo.net',
];

export function isTrustedOrigin(origin: string, appUrl?: string, allowedOrigins?: string): boolean {
  if (!origin) return false;
  if (LOCALHOST_ORIGINS.has(origin) ||
      origin.startsWith('http://localhost/') || origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1/') || origin.startsWith('http://127.0.0.1:')) {
    return true;
  }
  // Tunnel hosts
  try {
    const host = new URL(origin).host;
    if (TUNNEL_SUFFIXES.some((s) => host === s.slice(1) || host.endsWith(s))) return true;
  } catch { /* malformed */ }

  // APP_URL
  if (appUrl) {
    const allowed = appUrl.split(',').map((u) => u.trim()).filter(Boolean);
    if (allowed.some((u) => origin === u || origin.startsWith(u + '/'))) return true;
    try {
      const hosts = allowed.map((u) => new URL(u).host);
      const originHost = new URL(origin).host;
      if (hosts.includes(originHost)) return true;
    } catch { /* */ }
  }

  // ALLOWED_ORIGINS
  if (allowedOrigins) {
    const allowed = allowedOrigins.split(',').map((u) => u.trim()).filter(Boolean);
    if (allowed.some((u) => origin === u || origin.startsWith(u + '/'))) return true;
    try {
      const hosts = allowed.map((u) => new URL(u).host);
      const originHost = new URL(origin).host;
      if (hosts.includes(originHost)) return true;
      if (hosts.some((h) => originHost === h || originHost.endsWith('.' + h))) return true;
    } catch { /* */ }
  }
  return false;
}

// ── Body size limiter ─────────────────────────────────────────
export const DEFAULT_MAX_BODY_SIZE = 1_000_000; // 1 MB

export function checkBodySize(req: NextRequest, maxBytes = DEFAULT_MAX_BODY_SIZE): boolean {
  const cl = parseInt(req.headers.get('content-length') ?? '0', 10);
  return cl <= maxBytes;
}
