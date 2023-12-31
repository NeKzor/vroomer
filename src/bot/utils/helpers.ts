// Copyright (c) 2023, NeKz
// SPDX-License-Identifier: MIT

import type { Bot, CreateApplicationCommand, Guild } from '@discordeno/bot';
import { logger } from './logger.ts';
import { commands } from '../commands/mod.ts';
import type { BotWithCache } from '../bot.ts';

const log = logger({ name: 'Helpers' });

/**
 * Update global commands.
 *
 * @param bot - The bot object.
 */
export async function updateCommands(bot: BotWithCache) {
  const globalCommands = commands
    .filter(({ scope }) => scope === 'Global' || scope === undefined)
    .map<CreateApplicationCommand>(({ name, description, type, options }) => ({
      name,
      description,
      type,
      options,
    }));

  if (!globalCommands.length) {
    return;
  }

  log.info(`Updating ${globalCommands.length} global commands`);

  await bot.helpers.upsertGlobalApplicationCommands(globalCommands)
    .catch(log.error);
}

/**
 * Update guild specific commands.
 *
 * @param bot - The bot object.
 * @param guild - The guild object.
 */
export async function updateGuildCommands(bot: Bot, guild: Guild) {
  const guildCommands = commands
    .filter(({ scope, guilds }) => scope === 'Guild' && (!guilds?.length || guilds.includes(guild.id)))
    .map<CreateApplicationCommand>(({ name, description, type, options }) => ({
      name,
      description,
      type,
      options,
    }));

  if (!guildCommands.length) {
    return;
  }

  log.info(`Updating ${guildCommands.length} commands for guild ${guild.id}`);

  await bot.helpers.upsertGuildApplicationCommands(guild.id, guildCommands)
    .catch(log.error);
}

/**
 * Get the guild by ID.
 *
 * @param bot - The bot object.
 * @param guildId - The ID of the guild.
 * @returns - Guild object.
 */
export async function getGuildFromId(
  bot: BotWithCache,
  guildId: bigint,
): Promise<Guild> {
  let returnValue: Guild = {} as Guild;

  if (guildId !== 0n) {
    const guild = bot.guilds.get(guildId);
    if (guild) {
      returnValue = guild;
    }

    await bot.helpers.getGuild(guildId).then((guild) => {
      if (guild) {
        bot.guilds.set(guildId, guild);
        returnValue = guild;
      }
    });
  }

  return returnValue;
}

/**
 * Escape the title of a link for rendering Discord's masked links.
 *
 * NOTE: Discord's masked links are a scuffed version of Markdown links.
 *       You cannot escape [ and ] which means you have to remove it.
 *
 * @param linkTitle - The link title to escape.
 * @returns
 */
export function escapeMaskedLink(linkTitle: string) {
  return ['[', ']'].reduce(
    (text, characterToRemove) => text.replaceAll(characterToRemove, ''),
    linkTitle,
  );
}

const specialMdCharacters = [
  '[',
  ']',
  '(',
  ')',
  '`',
  '*',
  '_',
  '~',
];

/**
 * Escapes text for rendering Markdown content.
 *
 * @param text - The text to escape.
 * @returns - Escaped text.
 */
export function escapeMarkdown(text: string) {
  return specialMdCharacters.reduce(
    (title, char) => title.replaceAll(char, `\\${char}`),
    text,
  );
}
