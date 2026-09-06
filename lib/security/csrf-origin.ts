export interface CsrfOriginOptions {
  source: string;
  requestOrigin: string;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
  nodeEnv?: string;
  appUrls?: string;
  allowedOrigins?: string;
}

function parseOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function configuredOrigins(value: string | undefined): Set<string> {
  return new Set(
    String(value ?? '')
      .split(',')
      .map((entry) => parseOrigin(entry.trim()))
      .filter((entry): entry is string => Boolean(entry)),
  );
}

function isLoopback(origin: string): boolean {
  const hostname = new URL(origin).hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/**
 * Production accepts only the current deployment origin or an exact
 * operator-configured origin. Shared hosting suffixes must never become a
 * production wildcard. Development retains loopback and tunnel convenience.
 */
export function isTrustedCsrfOrigin(options: CsrfOriginOptions): boolean {
  const sourceOrigin = parseOrigin(options.source);
  if (!sourceOrigin) return false;

  const sameOriginCandidates = new Set<string>();
  const directOrigin = parseOrigin(options.requestOrigin);
  if (directOrigin) sameOriginCandidates.add(directOrigin);

  const forwardedHost = String(options.forwardedHost ?? '').trim();
  const forwardedProto = String(options.forwardedProto ?? '').trim().toLowerCase();
  if (forwardedHost && (forwardedProto === 'http' || forwardedProto === 'https')) {
    const forwardedOrigin = parseOrigin(`${forwardedProto}://${forwardedHost}`);
    if (forwardedOrigin) sameOriginCandidates.add(forwardedOrigin);
  }

  if (sameOriginCandidates.has(sourceOrigin)) return true;

  const exactConfigured = new Set([
    ...configuredOrigins(options.appUrls),
    ...configuredOrigins(options.allowedOrigins),
  ]);
  if (exactConfigured.has(sourceOrigin)) return true;

  if (options.nodeEnv === 'production') return false;
  if (isLoopback(sourceOrigin)) return true;

  const hostname = new URL(sourceOrigin).hostname;
  const developmentTunnelHosts = [
    'loca.lt',
    'ngrok.io',
    'ngrok-free.app',
    'ngrok.app',
    'trycloudflare.com',
    'githubpreview.dev',
    'gitpod.io',
    'serveousercontent.com',
    'serveo.net',
  ];
  return developmentTunnelHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}
