import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class UnsafeOutboundUrlError extends Error {
  constructor(message = 'Webhook URL is not allowed') {
    super(message);
    this.name = 'UnsafeOutboundUrlError';
  }
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0];
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8')
    || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')
    || normalized.startsWith('ff')) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mapped ? isPrivateIpv4(mapped) : false;
}

function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
}

/**
 * Resolve and validate a server-side webhook destination.
 * Validation is repeated immediately before every delivery to reduce DNS
 * rebinding risk. Redirects are disabled by the dispatcher as a second layer.
 */
export async function validateWebhookUrl(rawUrl: unknown): Promise<string> {
  if (typeof rawUrl !== 'string' || rawUrl.length > 2048) throw new UnsafeOutboundUrlError();

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeOutboundUrlError('Webhook URL is invalid');
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new UnsafeOutboundUrlError();
  }
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new UnsafeOutboundUrlError('Production webhooks must use HTTPS');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!hostname
    || hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || hostname.endsWith('.internal')
    || hostname === 'metadata.google.internal') {
    throw new UnsafeOutboundUrlError();
  }

  const literalFamily = isIP(hostname);
  if (literalFamily && isPrivateAddress(hostname)) throw new UnsafeOutboundUrlError();

  if (!literalFamily) {
    let addresses: Array<{ address: string }>;
    try {
      addresses = await lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new UnsafeOutboundUrlError('Webhook hostname could not be resolved');
    }
    if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
      throw new UnsafeOutboundUrlError();
    }
  }

  url.hash = '';
  return url.toString();
}
