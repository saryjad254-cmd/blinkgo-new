import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

interface DeliveryPinInput {
  orderId: string;
  customerId: string;
  createdAt: string;
}

function deliveryPinSecret(): string {
  const configured = process.env.DELIVERY_PIN_SECRET || process.env.DRAFT_SIGNING_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DELIVERY_PIN_SECRET must be configured in production');
  }
  return 'blinkgo-local-delivery-pin-secret';
}

export function createDeliveryPin(input: DeliveryPinInput): string {
  const digest = createHmac('sha256', deliveryPinSecret())
    .update(`${input.orderId}:${input.customerId}:${input.createdAt}`)
    .digest();
  return String(digest.readUInt32BE(0) % 10_000).padStart(4, '0');
}

export function verifyDeliveryPin(input: DeliveryPinInput, candidate: unknown): boolean {
  if (typeof candidate !== 'string' || !/^\d{4}$/.test(candidate)) return false;
  const expected = Buffer.from(createDeliveryPin(input));
  const received = Buffer.from(candidate);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
