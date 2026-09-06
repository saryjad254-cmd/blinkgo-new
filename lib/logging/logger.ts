/**
 * @deprecated — re-export from @/lib/foundation/logger.
 * Use `import { log, ... } from '@/lib/foundation/logger'` instead.
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
