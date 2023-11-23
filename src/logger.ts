// Copyright (c) 2023, NeKz
// SPDX-License-Identifier: MIT

import * as log from 'log/mod.ts';

const level: log.LevelName = 'INFO';
const formatter = ({ datetime, levelName, msg, args }: log.LogRecord) =>
  `${datetime.toISOString()} ${levelName} ${msg} ${args.join(' ')}`;

log.setup({
  handlers: {
    console: new log.handlers.ConsoleHandler(level, { formatter }),
    file: new log.handlers.RotatingFileHandler(level, {
      filename: './logs/info.txt',
      formatter,
      maxBackupCount: 5,
      maxBytes: 100 * 1024 * 1024,
    }),
  },
  loggers: {
    default: {
      level,
      handlers: ['console', 'file'],
    },
  },
});

export const logger = log.getLogger();
