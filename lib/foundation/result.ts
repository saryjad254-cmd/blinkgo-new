/**
 * Foundation: Result Type
 * ────────────────────────
 * Type-safe alternative to throwing exceptions for expected failures.
 */

import { AppError, isAppError, toAppError } from './errors';

export type Result<T, E = AppError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return Object.freeze({ ok: true as const, value });
}

export function err<E>(error: E): Result<never, E> {
  return Object.freeze({ ok: false as const, error });
}

export function isOk<T, E>(r: Result<T, E>): r is { ok: true; value: T } {
  return r.ok === true;
}

export function isErr<T, E>(r: Result<T, E>): r is { ok: false; error: E } {
  return r.ok === false;
}

export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok === true) return r.value;
  throw r.error instanceof Error ? r.error : new Error(String(r.error));
}

export function unwrapOr<T, E>(r: Result<T, E>, fallback: T): T {
  return r.ok === true ? r.value : fallback;
}

export function map<T, U, E>(r: Result<T, E>, fn: (v: T) => U): Result<U, E> {
  return r.ok === true ? ok(fn(r.value)) : r;
}

export function mapErr<T, E, F>(r: Result<T, E>, fn: (e: E) => F): Result<T, F> {
  return r.ok === true ? r : err(fn(r.error));
}

export function andThen<T, U, E>(r: Result<T, E>, fn: (v: T) => Result<U, E>): Result<U, E> {
  return r.ok === true ? fn(r.value) : r;
}

export function orElse<T, E, F>(r: Result<T, E>, fn: (e: E) => Result<T, F>): Result<T, F> {
  return r.ok === true ? r : fn(r.error);
}

export function fromThrowable<T>(fn: () => T): Result<T, AppError> {
  try {
    return ok(fn());
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function fromThrowableAsync<T>(fn: () => Promise<T>): Promise<Result<T, AppError>> {
  try {
    return ok(await fn());
  } catch (e) {
    return err(toAppError(e));
  }
}

export function all<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const r of results) {
    if (r.ok === false) return r;
    values.push(r.value);
  }
  return ok(values);
}

export function partition<T, E>(
  results: Result<T, E>[],
): { ok: T[]; err: E[] } {
  const oks: T[] = [];
  const errs: E[] = [];
  for (const r of results) {
    if (r.ok === true) oks.push(r.value);
    else errs.push(r.error);
  }
  return { ok: oks, err: errs };
}
