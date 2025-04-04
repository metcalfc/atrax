import winston from 'winston';

/**
 * Create a logger instance with formatted output
 */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...rest }) => {
      const restString = Object.keys(rest).length ? ` ${JSON.stringify(rest, null, 2)}` : '';

      return `${timestamp} [${level}]: ${message}${restString}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      stderrLevels: ['error'],
    }),
  ],
});

/**
 * Create a child logger with a specific context
 *
 * @param context - Context for the logger
 * @returns Child logger instance
 */
export function createContextLogger(context: string) {
  return logger.child({ context });
}
