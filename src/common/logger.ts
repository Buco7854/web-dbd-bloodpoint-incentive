import pino, { type Logger } from 'pino';

export type { Logger };

/**
 * Root structured logger. Child loggers (`logger.child({ component })`) are
 * injected into services so log lines carry their origin.
 */
export function createLogger(level: string): Logger {
  return pino({
    level: level || 'info',
    base: undefined, // drop pid/hostname noise
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'apiKey',
        'api-key',
        'password',
        'sharedSecret',
        'token',
        'STEAM_PASSWORD',
        'STEAM_SHARED_SECRET',
        'DBD_API_KEY',
      ],
      censor: '[redacted]',
    },
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  });
}
