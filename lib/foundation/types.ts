/**
 * Foundation: Core Type System
 * ────────────────────────────
 * Strong, branded types for all IDs and shared domain primitives.
 * Use these everywhere — `type UserId = Brand<string, 'UserId'>` makes
 * accidental cross-assignment a compile error.
 *
 * Convention: every ID ends in `Id` and is opaque. Primitive strings
 * are NEVER used for IDs at the API or storage layer.
 */

// ── Branding ─────────────────────────────────────────────────────
declare const __brand: unique symbol;
type Brand<T, B> = T & { readonly [__brand]: B };

// ── ID types ─────────────────────────────────────────────────────
export type UserId = Brand<string, 'UserId'>;
export type OrderId = Brand<string, 'OrderId'>;
export type RestaurantId = Brand<string, 'RestaurantId'>;
export type DriverId = Brand<string, 'DriverId'>;
export type ProductId = Brand<string, 'ProductId'>;
export type CategoryId = Brand<string, 'CategoryId'>;
export type AddressId = Brand<string, 'AddressId'>;
export type NotificationId = Brand<string, 'NotificationId'>;
export type CouponId = Brand<string, 'CouponId'>;
export type PaymentId = Brand<string, 'PaymentId'>;
export type ZoneId = Brand<string, 'ZoneId'>;

// ── Branded value helpers ───────────────────────────────────────
export const id = {
  user: (s: string) => s as UserId,
  order: (s: string) => s as OrderId,
  restaurant: (s: string) => s as RestaurantId,
  driver: (s: string) => s as DriverId,
  product: (s: string) => s as ProductId,
  category: (s: string) => s as CategoryId,
  address: (s: string) => s as AddressId,
  notification: (s: string) => s as NotificationId,
  coupon: (s: string) => s as CouponId,
  payment: (s: string) => s as PaymentId,
  zone: (s: string) => s as ZoneId,
} as const;

// ── Roles & permissions ─────────────────────────────────────────
export const ROLES = ['customer', 'driver', 'restaurant', 'manager', 'admin', 'super_admin'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_HIERARCHY: Record<Role, number> = {
  customer: 0,
  driver: 1,
  restaurant: 1,
  manager: 2,
  admin: 3,
  super_admin: 4,
} as const;

export function roleSatisfies(userRole: Role, required: Role | Role[]): boolean {
  const requiredArr = Array.isArray(required) ? required : [required];
  const highestRequired = Math.max(...requiredArr.map((r) => ROLE_HIERARCHY[r] ?? 0));
  return ROLE_HIERARCHY[userRole] >= highestRequired;
}

// ── Locale ───────────────────────────────────────────────────────
export const LOCALES = ['de', 'ar', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'de';
export const RTL_LOCALES: ReadonlyArray<Locale> = ['ar'] as const;
// isRTL() is in ./format.ts to avoid circular import.

// ── Money & currency ────────────────────────────────────────────
export type Cents = Brand<number, 'Cents'>;
export const cents = (n: number) => Math.round(n) as Cents;
export const EUR = {
  fromCents: (c: Cents) => c / 100,
  toCents: (euros: number) => cents(euros * 100),
  format: (amount: number | Cents, locale: Locale = DEFAULT_LOCALE) => {
    const value = typeof amount === 'number' ? amount : EUR.fromCents(amount);
    return new Intl.NumberFormat(localeToBcp47(locale), {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  },
} as const;

function localeToBcp47(locale: Locale): string {
  return ({ de: 'de-DE', ar: 'ar-SA', en: 'en-US' } as const)[locale];
}

// ── Time ─────────────────────────────────────────────────────────
export type ISODate = Brand<string, 'ISODate'>;
export const nowISO = (): ISODate => new Date().toISOString() as ISODate;
export const isoDate = (s: string) => s as ISODate;

// ── Geo ──────────────────────────────────────────────────────────
export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371_000;
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

// ── Result type is in ./result.ts to avoid circular import ─

// ── Common domain types ─────────────────────────────────────────
export interface Timestamped {
  readonly created_at: ISODate;
  readonly updated_at: ISODate;
}

export type Status = 'pending' | 'active' | 'inactive' | 'archived' | 'banned';

// ── API response envelope ───────────────────────────────────────
export interface ApiSuccess<T> {
  readonly ok: true;
  readonly data: T;
  readonly meta?: Record<string, unknown>;
  readonly requestId?: string;
}
export interface ApiFailure {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly statusCode: number;
    readonly details?: unknown;
  };
  readonly requestId?: string;
}
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

// ── App error shape (re-exported as type alias) ─
export interface AppErrorShape {
  readonly name: string;
  readonly code: string;
  readonly statusCode: number;
  readonly message: string;
  readonly safeMessage: string;
  readonly isOperational: boolean;
  readonly cause?: unknown;
  readonly meta?: Record<string, unknown>;
}

// ── Logger types ───────────────────────────────────────────────
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export type LogContext = Record<string, unknown>;
export interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly context: LogContext;
}
export interface Logger {
  debug(message: string, context?: LogContext, err?: unknown): void;
  info(message: string, context?: LogContext, err?: unknown): void;
  warn(message: string, context?: LogContext, err?: unknown): void;
  error(message: string, context?: LogContext, err?: unknown): void;
  fatal(message: string, context?: LogContext, err?: unknown): void;
  child(context: LogContext): Logger;
}

// ── Type utilities ───────────────────────────────────────────────
export type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K];
};
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type AsyncReturn<T> = Promise<T>;
