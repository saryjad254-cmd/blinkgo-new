/**
 * Foundation: Mini Zod
 * ────────────────────
 * A tiny validation library (300 LOC) that does what we actually use.
 */

export interface ZodIssue {
  readonly path: (string | number)[];
  readonly message: string;
  readonly code: string;
}

export interface ZodSuccess<T> {
  readonly success: true;
  readonly data: T;
}
export interface ZodFailure {
  readonly success: false;
  readonly error: { readonly issues: ReadonlyArray<ZodIssue> };
}
export type ZodResult<T> = ZodSuccess<T> | ZodFailure;

export interface ZodType<T> {
  readonly _output: T;
  optional(): ZodType<T | undefined>;
  default(value: T): ZodType<T>;
  parse(input: unknown): T;
  safeParse(input: unknown): ZodResult<T>;
}

export interface ZodStringType extends ZodType<string> {
  min(n: number): ZodStringType;
  max(n: number): ZodStringType;
}

function makeSuccess<T>(data: T): ZodSuccess<T> {
  return { success: true, data };
}
function makeFailure(issues: ZodIssue[]): ZodFailure {
  return { success: false, error: { issues } };
}
function makeFailureFromIssue(iss: ZodIssue): ZodFailure {
  return makeFailure([iss]);
}
function unwrapFailure<T>(r: ZodResult<T>): ZodFailure {
  return r.success === false ? r : { success: false, error: { issues: [] } };
}

class Base<T> implements ZodType<T> {
  readonly _output!: T;
  constructor(
    private readonly validate: (input: unknown, path: (string | number)[]) => ZodIssue | null,
  ) {}
  optional(): ZodType<T | undefined> {
    const v = this.validate;
    return new Base<T | undefined>((input, p) => (input === undefined ? null : v(input, p)));
  }
  default(value: T): ZodType<T> {
    const v = this.validate;
    return new Base<T>((input, p) => (input === undefined ? null : v(value, p)));
  }
  parse(input: unknown): T {
    const r = this.safeParse(input);
    if (r.success === false) {
      const failure = unwrapIssues(r);
      throw new Error(`Validation failed: ${failure.error.issues[0]?.message ?? 'unknown'}`);
    }
    return r.data;
  }
  safeParse(input: unknown): ZodResult<T> {
    const err = this.validate(input, []);
    if (err) return makeFailureFromIssue(err);
    return makeSuccess(input as T);
  }
}

class StringBase extends Base<string> implements ZodStringType {
  min(n: number): ZodStringType {
    return new StringBase((input: unknown, p: (string | number)[]) => {
      if (typeof input !== 'string') return { code: 'invalid_type', message: 'Expected string', path: p };
      if (input.length < n) return { code: 'too_small', message: `Min length ${n}`, path: p };
      return null;
    });
  }
  max(n: number): ZodStringType {
    return new StringBase((input: unknown, p: (string | number)[]) => {
      if (typeof input !== 'string') return { code: 'invalid_type', message: 'Expected string', path: p };
      if (input.length > n) return { code: 'too_big', message: `Max length ${n}`, path: p };
      return null;
    });
  }
}

function issue(code: string, message: string, path: (string | number)[]): ZodIssue {
  return { code, message, path };
}

function urlValidate(input: unknown, p: (string | number)[]): ZodIssue | null {
  if (typeof input !== 'string') return issue('invalid_type', 'Expected string', p);
  try { new URL(input); return null; } catch { return issue('invalid_url', 'Invalid URL', p); }
}
function stringValidate(input: unknown, p: (string | number)[]): ZodIssue | null {
  return typeof input === 'string' ? null : issue('invalid_type', 'Expected string', p);
}

function unwrapIssues<T>(r: ZodResult<T>): ZodFailure {
  if (r.success === false) return r;
  return { success: false, error: { issues: [] } };
}

export const z = {
  string: (): ZodStringType => new StringBase(stringValidate) as unknown as ZodStringType,
  number: () => new Base<number>((v, p) => (typeof v === 'number' && !isNaN(v) ? null : issue('invalid_type', 'Expected number', p))),
  boolean: () => new Base<boolean>((v, p) => (typeof v === 'boolean' ? null : issue('invalid_type', 'Expected boolean', p))),
  url: () => new Base<string>(urlValidate),
  email: () => new Base<string>((v, p) => {
    if (typeof v !== 'string') return issue('invalid_type', 'Expected string', p);
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : issue('invalid_email', 'Invalid email', p);
  }),
  uuid: () => new Base<string>((v, p) => {
    if (typeof v !== 'string') return issue('invalid_type', 'Expected string', p);
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
      ? null
      : issue('invalid_uuid', 'Invalid UUID', p);
  }),
  literal: <T extends string | number | boolean>(value: T) => new Base<T>(
    (v, p) => (v === value ? null : issue('invalid_literal', `Expected ${value}`, p)),
  ),
  enum: <T extends string>(values: ReadonlyArray<T>) => new Base<T>(
    (v, p) => (typeof v === 'string' && (values as readonly string[]).includes(v)
      ? null
      : issue('invalid_enum', `Expected one of: ${values.join(', ')}`, p)),
  ),
  object: <S extends Record<string, ZodType<unknown>>>(shape: S) =>
    new Base<{ [K in keyof S]: S[K] extends ZodType<infer U> ? U : never }>((v, p) => {
      if (typeof v !== 'object' || v === null) return issue('invalid_type', 'Expected object', p);
      const obj = v as Record<string, unknown>;
      for (const k of Object.keys(shape)) {
        const sub = shape[k]!.safeParse(obj[k]);
        if (sub.success === false) {
          const failure = unwrapFailure(sub);
          for (const iss of failure.error.issues) {
            return { ...iss, path: [...p, k, ...iss.path] };
          }
        }
      }
      return null;
    }),
  array: <T>(item: ZodType<T>) => new Base<T[]>((v, p) => {
    if (!Array.isArray(v)) return issue('invalid_type', 'Expected array', p);
    for (let i = 0; i < v.length; i++) {
      const sub = item.safeParse(v[i]);
      if (sub.success === false) {
        const failure = unwrapIssues(sub);
        for (const iss of failure.error.issues) {
          return { ...iss, path: [...p, i, ...iss.path] };
        }
      }
    }
    return null;
  }),
  record: <V>(value: ZodType<V>) => new Base<Record<string, V>>((v, p) => {
    if (typeof v !== 'object' || v === null) return issue('invalid_type', 'Expected object', p);
    for (const k of Object.keys(v as Record<string, unknown>)) {
      const sub = value.safeParse((v as Record<string, unknown>)[k]);
      if (sub.success === false) {
        const failure = unwrapIssues(sub);
        for (const iss of failure.error.issues) {
          return { ...iss, path: [...p, k, ...iss.path] };
        }
      }
    }
    return null;
  }),
  any: () => new Base<unknown>(() => null),
  unknown: () => new Base<unknown>(() => null),
  null: () => new Base<null>((v, p) => (v === null ? null : issue('invalid_type', 'Expected null', p))),
};

export type infer<T> = T extends ZodType<infer U> ? U : never;
