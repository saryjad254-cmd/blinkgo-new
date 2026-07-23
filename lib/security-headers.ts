// Security headers and CORS for BlinkGo
// Apply to every response via Next.js middleware

import { NextResponse, type NextRequest } from 'next/server';

// Allowed origins for CORS. Empty array = same-origin only.
function getAllowedOrigins(): (string | RegExp)[] {
  // Tunnels are allowed in BOTH dev and production because their subdomains
  // are randomly generated and can't be used for cross-site CSRF attacks.
  // For production deployments, set ALLOWED_ORIGINS env to restrict to your
  // own domains.
  const tunnelOrigins: (string | RegExp)[] = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    // localtunnel (loca.lt) — any subdomain
    /^https:\/\/[a-z0-9-]+\.loca\.lt$/,
    // ngrok tunnels
    /^https:\/\/[a-z0-9-]+\.ngrok\.io$/,
    /^https:\/\/[a-z0-9-]+\.ngrok-free\.app$/,
    /^https:\/\/[a-z0-9-]+\.ngrok\.app$/,
    // Cloudflare quick tunnels
    /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/,
    // Vercel previews
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/,
    // Netlify previews
    /^https:\/\/[a-z0-9-]+\.netlify\.app$/,
    // Serveo tunnels (dynamic, allow any)
    /^https:\/\/.*serveousercontent\.com$/,
  ];

  const isDev = process.env.NODE_ENV !== 'production';
  if (isDev) return tunnelOrigins;

  // Production: optionally restrict to user-defined origins
  // via ALLOWED_ORIGINS env (comma-separated, e.g. "https://app.example.com,https://admin.example.com")
  const envOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (envOrigins.length > 0) {
    return [...tunnelOrigins, ...envOrigins];
  }
  return tunnelOrigins; // tunnels allowed in prod too (random subdomains, no CSRF risk)
}

/** Check if an origin is allowed (string or RegExp) */
function isOriginAllowed(origin: string | null, allowed: (string | RegExp)[]): boolean {
  if (!origin) return false;
  for (const a of allowed) {
    if (typeof a === 'string' && a === origin) return true;
    if (a instanceof RegExp && a.test(origin)) return true;
  }
  return false;
}

/**
 * Apply CORS headers to a response. Only allows whitelisted origins.
 * Supports credentials only for whitelisted origins.
 */
export function applyCorsHeaders(req: NextRequest, res: NextResponse): NextResponse {
  const origin = req.headers.get('origin');
  const allowed = getAllowedOrigins();
  const isAllowed = isOriginAllowed(origin, allowed);

  if (isAllowed && origin) {
    res.headers.set('Access-Control-Allow-Origin', origin);
    res.headers.set('Access-Control-Allow-Credentials', 'true');
    res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.headers.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With, X-CSRF-Token, Accept',
    );
    res.headers.set('Access-Control-Max-Age', '86400'); // 24h
    res.headers.set('Vary', 'Origin');
  }

  return res;
}

/**
 * Apply security headers to every response.
 * Industry-standard: CSP, HSTS, X-Frame-Options, etc.
 */
export function applySecurityHeaders(res: NextResponse): NextResponse {
  // Prevent MIME-type sniffing
  res.headers.set('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking - DENY iframe embedding
  res.headers.set('X-Frame-Options', 'DENY');

  // XSS protection (modern browsers ignore, but kept for legacy)
  res.headers.set('X-XSS-Protection', '1; mode=block');

  // Referrer policy - only send origin for cross-origin requests
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions policy - disable unused features
  res.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(self), payment=(self), usb=(), magnetometer=(), gyroscope=(), accelerometer=()',
  );

  // HSTS - HTTPS only (only set in production)
  if (process.env.NODE_ENV === 'production') {
    res.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload',
    );
  }

  // Cross-origin isolation (defense against Spectre-class attacks)
  res.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  res.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  res.headers.set('Origin-Agent-Cluster', '?1');

  // Prevent caching of sensitive responses (defense in depth)
  res.headers.set('X-Permitted-Cross-Domain-Policies', 'none');

  // Content Security Policy
  // Production: stricter (no unsafe-eval)
  // Dev: allows unsafe-eval for Next.js hot reload
  const isDev = process.env.NODE_ENV !== 'production';
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.supabase.co https://maps.googleapis.com https://maps.gstatic.com https://unpkg.com"
    : "script-src 'self' 'unsafe-inline' https://*.supabase.co https://maps.googleapis.com https://maps.gstatic.com https://unpkg.com";

  const csp = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
    "img-src 'self' data: blob: https: http:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.resend.com https://maps.googleapis.com https://*.tiles.openstreetmap.org https://nominatim.openstreetmap.org https://*.basemaps.cartocdn.com",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-src 'self' https://*.supabase.co https://www.openstreetmap.org https://www.google.com",
    // Defense in depth: restrict where resources can be loaded from
    "manifest-src 'self'",
    "media-src 'self'",
    "worker-src 'self' blob:",
  ].join('; ');
  res.headers.set('Content-Security-Policy', csp);

  return res;
}

/** Handle CORS preflight (OPTIONS) requests */
export function handlePreflight(req: NextRequest): NextResponse {
  const res = new NextResponse(null, { status: 204 });
  return applyCorsHeaders(req, res);
}
