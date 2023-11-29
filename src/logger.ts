// Copyright (c) 2023, NeKz
// SPDX-License-Identifier: MIT

import * as log from 'log/mod.ts';

const isUsingDenoDeploy = Deno.env.get('DENO_DEPLOYMENT_ID') !== undefined;

const level: log.LevelName = 'INFO';

const formatter = ({ datetime, levelName, msg, args }: log.LogRecord) =>
  `${datetime.toISOString()} ${levelName} ${msg} ${args.map((arg) => Deno.inspect(arg)).join(' ')}`;

const consoleHandler = new log.handlers.ConsoleHandler(level, { formatter });

const fileHandler = isUsingDenoDeploy ? undefined : new log.handlers.RotatingFileHandler(level, {
  filename: './logs/info.txt',
  formatter,
  maxBackupCount: 5,
  maxBytes: 100 * 1024 * 1024,
});

log.setup({
  handlers: fileHandler
    ? {
      console: consoleHandler,
      file: fileHandler,
    }
    : {
      console: consoleHandler,
    },
  loggers: {
    default: {
      level,
      handlers: ['console', ...(fileHandler ? ['file'] : [])],
    },
  },
});

export const flushFileLogger = () => {
  fileHandler?.flush();
};

export const logFetchRequest = ({ method, url, res }: { method: string; url: string; res: Response }) => {
  logger.info(`[${method}] ${url} : ${res.status}`);
};

export const logger = log.getLogger();
