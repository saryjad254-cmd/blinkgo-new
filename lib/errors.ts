/**
 * @deprecated — re-export from @/lib/foundation.
 * Use `import { AppError, ValidationError, ... } from '@/lib/foundation'`.
 * This file remains as a compatibility shim for legacy imports.
 */
export {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  IdempotencyError,
  CircuitOpenError,
  CsrfError,
  InternalError,
  NotImplementedError,
  ServiceUnavailableError,
  GatewayTimeoutError,
  GoneError,
  toAppError,
  isAppError,
  isOperationalError,
  errorStatusCode,
} from '@/lib/foundation';
