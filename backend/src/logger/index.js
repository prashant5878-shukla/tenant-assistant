import pino from 'pino';
import { config } from '../config/index.js';

const pretty = config.NODE_ENV !== 'production';

export const logger = pino({
  level: config.LOG_LEVEL,
  base: undefined,
  transport: pretty
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
    : undefined,
});

/** Child logger bound to a module name: `const log = getLogger('ingest')`. */
export const getLogger = (module) => logger.child({ module });
