// Copyright (c) 2023, NeKz
// SPDX-License-Identifier: MIT

import {
  ApplicationCommandOptionChoice,
  ApplicationCommandOptionTypes,
  ApplicationCommandTypes,
  Bot,
  encode,
  Interaction,
  InteractionResponseTypes,
  InteractionTypes,
  MessageFlags,
} from '@discordeno/bot';
import { createCommand } from './mod.ts';
import { log } from '../utils/logger.ts';
import { createAutocompletion } from '../utils/autocompletion.ts';
import { db } from '../services/db.ts';
import { UpdateWebhook, Webhooks } from '../services/webhooks.ts';

const findUpdateWebhook = createAutocompletion({
  items: () => Webhooks.Updates,
  idKey: 'id',
  nameKey: 'name',
});

createCommand({
  name: 'campaign',
  description: 'Manage campaign updates.',
  type: ApplicationCommandTypes.ChatInput,
  scope: 'Global',
  options: [
    {
      name: 'add',
      description: 'Add campaign updates.',
      type: ApplicationCommandOptionTypes.SubCommand,
      options: [
        {
          name: 'club_id',
          description: 'Club ID. Can be found on trackmania.io.',
          type: ApplicationCommandOptionTypes.Number,
          required: true,
        },
        {
          name: 'name',
          description: 'Campaign name. Advanced patterns are possible too e.g. "regex:^(Winter|Spring|Summer|Fall)"',
          type: ApplicationCommandOptionTypes.String,
          required: true,
        },
        {
          name: 'ranking_channel',
          description: 'Channel which should receive ranking updates.',
          type: ApplicationCommandOptionTypes.Channel,
          required: true,
        },
        {
          name: 'update_channel',
          description: 'Channel which should receive record updates. Defaults to the current channel.',
          type: ApplicationCommandOptionTypes.Channel,
        },
      ],
    },
    {
      name: 'remove',
      description: 'Remove campaign updates.',
      type: ApplicationCommandOptionTypes.SubCommand,
      options: [
        {
          name: 'query',
          description: 'The name of the campaign to remove.',
          type: ApplicationCommandOptionTypes.String,
          autocomplete: true,
          required: true,
        },
      ],
    },
    {
      name: 'list',
      description: 'List campaign updates.',
      type: ApplicationCommandOptionTypes.SubCommand,
    },
  ],
  execute: async (bot: Bot, interaction: Interaction) => {
    if (!interaction.member?.permissions?.has('MANAGE_WEBHOOKS')) {
      await bot.helpers.sendInteractionResponse(
        interaction.id,
        interaction.token,
        {
          type: InteractionResponseTypes.ChannelMessageWithSource,
          data: {
            content: `❌️ You do not have permissions to use this command.`,
            flags: MessageFlags.Ephemeral,
          },
        },
      );
      return;
    }

    const subCommand = [...(interaction.data?.options?.values() ?? [])]
      .at(0)!;
    const args = [...(subCommand.options?.values() ?? [])];
    const getNumberArg = (name: string) => {
      return Number(
        args
          .find((arg) => arg.name === name)?.value,
      );
    };
    const getStringArg = (name: string) => {
      return args
        .find((arg) => arg.name === name)?.value?.toString()?.trim() ?? '';
    };
    const getArg = (name: string) => {
      return args.find((arg) => arg.name === name)?.value;
    };

    switch (interaction.type) {
      case InteractionTypes.ApplicationCommandAutocomplete: {
        switch (subCommand.name) {
          case 'remove': {
            const query = args.find((arg) => arg.name === 'name')?.value?.toString()?.toLowerCase() ?? '';

            await bot.helpers.sendInteractionResponse(
              interaction.id,
              interaction.token,
              {
                type: InteractionResponseTypes.ApplicationCommandAutocompleteResult,
                data: {
                  choices: findUpdateWebhook({ query, isAutocomplete: true })
                    .map((webhook) => {
                      return {
                        name: `${webhook.name} (Club ID: ${webhook.club_id})`,
                        value: webhook.id,
                      } as ApplicationCommandOptionChoice;
                    }),
                },
              },
            );
            break;
          }
          default:
            break;
        }
        break;
      }
      case InteractionTypes.ApplicationCommand: {
        switch (subCommand.name) {
          case 'add': {
            try {
              await bot.helpers.sendInteractionResponse(
                interaction.id,
                interaction.token,
                {
                  type: InteractionResponseTypes.ChannelMessageWithSource,
                  data: {
                    content: `Adding campaign...`,
                    flags: MessageFlags.Ephemeral,
                  },
                },
              );

              const clubId = getNumberArg('club_id');
              const campaignName = getStringArg('name');
              const channelId = BigInt(getArg('channel') ?? interaction.channelId!);
              const rankingChannelId = BigInt(getArg('ranking_channel')!);

              const isCampaignRegex = campaignName.startsWith('regex:');
              if (isCampaignRegex) {
                try {
                  new RegExp(campaignName.slice('regex:'.length));
                } catch (err) {
                  log.error(err);

                  await bot.helpers.editOriginalInteractionResponse(
                    interaction.token,
                    {
                      content: `❌️ Invalid regular expression for campaign name.`,
                    },
                  );
                  return;
                }
              }

              const key = ['webhook_updates', clubId, campaignName];

              const { value } = await db.get<UpdateWebhook>(key);
              if (value) {
                const webhook = await bot.helpers.getWebhook(value.webhook_id);
                if (webhook.channelId === channelId) {
                  await bot.helpers.editOriginalInteractionResponse(
                    interaction.token,
                    {
                      content: `❌️ This channel already receives campaign updates with the exact campaign name.`,
                    },
                  );
                  return;
                }

                const rankingWebhook = await bot.helpers.getWebhook(value.ranking_webhook_id);

                await bot.helpers.editWebhook(webhook.id, { channelId });
                await bot.helpers.editWebhook(rankingWebhook.id, { channelId: rankingChannelId });

                await bot.helpers.editOriginalInteractionResponse(
                  interaction.token,
                  {
                    content: `Moved campaign updates from <#${webhook.channelId}> to <#${channelId}>.`,
                  },
                );
              } else {
                const avatar = `data:image/jpeg;base64,${encode(await Deno.readFile('./avatar.jpg'))}`;

                const rankingWebhook = await bot.helpers.createWebhook(rankingChannelId, {
                  name: 'Trackmania',
                  avatar,
                });

                const rankingMessage = await bot.helpers.executeWebhook(rankingWebhook.id, rankingWebhook.token!, {
                  content: 'Ranking update...',
                  wait: true,
                });

                if (!rankingMessage) {
                  await bot.helpers.editOriginalInteractionResponse(
                    interaction.token,
                    {
                      content: `❌️ Failed to send initial ranking update message.`,
                    },
                  );
                  return;
                }

                const webhook = await bot.helpers.createWebhook(channelId, {
                  name: 'Trackmania',
                  avatar,
                });

                await db
                  .set(
                    key,
                    {
                      id: crypto.randomUUID(),
                      created_at: new Date().getTime(),
                      club_id: clubId!,
                      name: campaignName,
                      webhook_id: webhook.id,
                      webhook_url: webhook.url!,
                      ranking_webhook_id: rankingWebhook.id,
                      ranking_webhook_url: rankingWebhook.url!,
                      ranking_message_id: rankingMessage.id,
                      ranking_message_cache: '',
                    } satisfies UpdateWebhook,
                  );

                Webhooks.load().catch(log.error);

                await bot.helpers.editOriginalInteractionResponse(
                  interaction.token,
                  {
                    content: `Added campaign. New updates will be sent automatically to this channel.`,
                  },
                );
              }
            } catch (err) {
              log.error(err);

              await bot.helpers.editOriginalInteractionResponse(
                interaction.token,
                {
                  content: `❌️ Failed to add campaign.`,
                },
              );
            }
            break;
          }
          case 'remove': {
            try {
              await bot.helpers.sendInteractionResponse(
                interaction.id,
                interaction.token,
                {
                  type: InteractionResponseTypes.ChannelMessageWithSource,
                  data: {
                    content: `Removing campaign...`,
                    flags: MessageFlags.Ephemeral,
                  },
                },
              );

              const query = args.find((arg) => arg.name === 'query')?.value?.toString() ?? '';

              const webhooks = findUpdateWebhook({ query, isAutocomplete: false });
              const webhook = webhooks.at(0);

              if (!webhook) {
                await bot.helpers.sendInteractionResponse(
                  interaction.id,
                  interaction.token,
                  {
                    type: InteractionResponseTypes.ChannelMessageWithSource,
                    data: {
                      content: `❌️ Campaign not found.`,
                      flags: MessageFlags.Ephemeral,
                    },
                  },
                );
                return;
              }

              if (webhooks.length > 1) {
                await bot.helpers.sendInteractionResponse(
                  interaction.id,
                  interaction.token,
                  {
                    type: InteractionResponseTypes.ChannelMessageWithSource,
                    data: {
                      content: `❌️ Your query matched too many results. Please choose a result from autocompletion.`,
                      flags: MessageFlags.Ephemeral,
                    },
                  },
                );
                return;
              }

              await db.delete(['webhook_updates', webhook.club_id, webhook.name]);

              Webhooks.load().catch(log.error);

              try {
                await bot.helpers.deleteWebhook(webhook.webhook_id);
              } catch (err) {
                log.error(err);
              }

              try {
                await bot.helpers.deleteWebhook(webhook.ranking_webhook_id);
              } catch (err) {
                log.error(err);
              }

              await bot.helpers.editOriginalInteractionResponse(
                interaction.token,
                {
                  content: `Removed campaign.`,
                },
              );
            } catch (err) {
              log.error(err);

              await bot.helpers.editOriginalInteractionResponse(
                interaction.token,
                {
                  content: `❌️ Failed to remove campaign.`,
                },
              );
            }
            break;
          }
          case 'list': {
            try {
              await bot.helpers.sendInteractionResponse(
                interaction.id,
                interaction.token,
                {
                  type: InteractionResponseTypes.ChannelMessageWithSource,
                  data: {
                    content: `Listing campaigns...`,
                    flags: MessageFlags.Ephemeral,
                  },
                },
              );

              const guildWebhooks = await bot.helpers.getGuildWebhooks(interaction.guildId!);
              const webhooks: string[] = [];

              for await (const { value: webhook } of db.list<UpdateWebhook>({ prefix: ['webhook_updates'] })) {
                const updateWebhook = guildWebhooks.find(({ url }) => url === webhook.webhook_url);
                const rankingWebhook = guildWebhooks.find(({ url }) => url === webhook.ranking_webhook_url);

                webhooks.push([
                  webhook.name,
                  `Club ID: ${webhook.club_id}`,
                  `Update Channel: ${updateWebhook?.channelId ? `<#${updateWebhook.channelId}>` : '*not found*'}`,
                  `Ranking Channel: ${rankingWebhook?.channelId ? `<#${rankingWebhook.channelId}>` : '*not found*'}`,
                ].join(' | '));
              }

              await bot.helpers.editOriginalInteractionResponse(
                interaction.token,
                {
                  content: webhooks.length ? webhooks.join('\n').slice(0, 2_000) : 'No campaigns found.',
                },
              );
            } catch (err) {
              log.error(err);

              await bot.helpers.editOriginalInteractionResponse(
                interaction.token,
                {
                  content: `❌️ Failed to list campaigns.`,
                },
              );
            }
            break;
          }
          default:
            break;
        }
        break;
      }
      default:
        break;
    }
  },
});
