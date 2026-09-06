/**
 * @deprecated — re-export from @/lib/foundation.
 * Use `import { log, logger, generateRequestId, startTimer } from '@/lib/foundation'`.
 */
export {
  log,
  logger,
  generateRequestId,
  startTimer,
  ConsoleLogger,
  setLevel,
  getLevel,
  withRequestLogger,
  type LogContext,
  type LogLevel,
  type Logger,
} from '@/lib/foundation/logger';
