// Copyright (c) 2023, NeKz
// SPDX-License-Identifier: MIT

/// <reference lib="deno.unstable" />

import 'dotenv/load.ts';

import { loadAllServices } from './services/mod.ts';
import { logger } from './utils/logger.ts';
import { updateCommands } from './utils/helpers.ts';
import { bot } from './bot.ts';

// TODO: file logging
const log = logger({ name: 'Main' });

addEventListener('error', (ev) => {
  console.dir({ error: ev.error }, { depth: 16 });
});

addEventListener('unhandledrejection', (ev) => {
  ev.preventDefault();

  console.dir({ unhandledrejection: ev.reason }, { depth: 16 });

  if (ev.reason?.body) {
    Deno.stdout.writeSync(new TextEncoder().encode(ev.reason.body));
  }
});

log.info('Using User-Agent:', Deno.env.get('USER_AGENT')!);
log.info('Starting bot...');

await loadAllServices();

await import('./commands/campaign.ts');

await import('./events/guildCreate.ts');
await import('./events/interactionCreate.ts');
await import('./events/ready.ts');

await updateCommands(bot);

log.info('Running bot...');

await bot.start();
