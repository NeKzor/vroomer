// Copyright (c) 2023, NeKz
// SPDX-License-Identifier: MIT

import * as log from 'log/mod.ts';

const isUsingDenoDeploy = Deno.env.get('DENO_DEPLOYMENT_ID') !== undefined;

const level: log.LevelName = 'INFO';
const formatter = ({ datetime, levelName, msg, args }: log.LogRecord) =>
  `${datetime.toISOString()} ${levelName} ${msg} ${args.join(' ')}`;

const fileHandler = isUsingDenoDeploy ? undefined : new log.handlers.RotatingFileHandler(level, {
  filename: './logs/info.txt',
  formatter,
  maxBackupCount: 5,
  maxBytes: 100 * 1024 * 1024,
});

log.setup({
  handlers: {
    console: new log.handlers.ConsoleHandler(level, { formatter }),
    file: fileHandler!,
  },
  loggers: {
    default: {
      level,
      handlers: ['console', ...(fileHandler ? ['file'] : [])],
    },
  },
});

export const logger = log.getLogger();
