/**
 * Logging — barrel export
 * ────────────────────────
 * Single import point for all logging concerns.
 * The actual implementation lives in lib/logging/logger.ts
 * (PII redaction, request context, performance timing).
 */

export {
  logger,
  generateRequestId,
  startTimer,
  type LogContext,
} from './logging/logger';
