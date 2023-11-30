// Copyright (c) 2023, NeKz
// SPDX-License-Identifier: MIT

import { Campaign, Track, TrackRecord } from './models.ts';
import { Zone } from './api.ts';
import { escapeMarkdown, formatScore, getEmojiFlag } from './utils.ts';

export type MessageRecordBuildData = { wr: TrackRecord; track: Track };
export type MessageCampaignBuildData = {
  campaign: Campaign;
  tracks: Track[];
  records: TrackRecord[];
  stats: {
    leaderboard: {
      user: {
        date?: string | undefined;
        id: string;
        name: string;
        zone: Zone[];
      };
      wrs: number | undefined;
    }[];
  };
  rankings: {
    user: {
      id: string;
      zone: Zone[];
      name: string;
    };
    points: number;
  }[];
};
export type MessageBuilderFunction =
  | typeof DiscordWebhook.buildRecordMessage
  | typeof DiscordWebhook.buildRankingsMessage;

export class DiscordWebhook<MessageBuilderData> {
  public messageBuilder: (data: MessageBuilderData) => Record<string, unknown>;
  public onRequest?: (args: { url: string; method: string }) => void;
  public onFetch?: (args: { url: string; method: string; res: Response }) => void;

  constructor(
    options: {
      optimizeDataUsage?: boolean;
      messageBuilder: (data: MessageBuilderData) => Record<string, unknown>;
      onRequest?: (args: { url: string; method: string }) => void;
      onFetch?: (args: { url: string; method: string; res: Response }) => void;
    },
  ) {
    this.messageBuilder = options.messageBuilder;
    this.onRequest = options.onRequest;
    this.onFetch = options.onFetch;
  }
  async send(webhookUrl: string, data: MessageBuilderData) {
    const body = JSON.stringify(this.messageBuilder(data));

    const url = webhookUrl;
    const method = 'POST';

    this.onRequest?.call(this, { url, method });

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body,
    });

    this.onFetch?.call(this, { url, method, res });

    if (!res.ok) {
      throw new Error(
        `Failed to execute webhook : ${res.status} : ${await res.text()}`,
      );
    }

    return body;
  }
  async edit(webhookUrl: string, messageId: string, data: MessageBuilderData, lastCachedMessage = '') {
    const body = JSON.stringify(this.messageBuilder(data));
    if (lastCachedMessage.length && lastCachedMessage === body) {
      return;
    }

    const url = `${webhookUrl}/messages/${messageId}`;
    const method = 'PATCH';

    this.onRequest?.call(this, { url, method });

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body,
    });

    this.onFetch?.call(this, { url, method, res });

    if (!res.ok) {
      throw new Error(
        `Failed to edit webhook : ${res.status} : ${await res.text()}`,
      );
    }

    return body;
  }
  static buildRecordMessage(
    { wr, track }: MessageRecordBuildData,
  ): Record<string, unknown> {
    return {
      embeds: [
        {
          title: track.name.replace(
            /(\$[0-9a-fA-F]{3}|\$[WNOITSGZBEMwnoitsgzbem]{1})/g,
            '',
          ),
          url: 'https://trackmania.io/#/leaderboard/' + track.uid,
          color: 15772743,
          fields: [
            {
              name: 'WR',
              value: `${formatScore(wr.score)} (-${formatScore(wr.delta)})`,
              inline: true,
            },
            {
              name: 'By',
              value: escapeMarkdown(wr.user.name) + getEmojiFlag(wr.user),
              inline: true,
            },
          ],
        },
      ],
    };
  }
  static buildRankingsMessage(
    { campaign, tracks, records, stats, rankings }: MessageCampaignBuildData,
  ): Record<string, unknown> {
    const trackMapping = tracks.reduce((names, track) => {
      names.set(track.uid, track);
      return names;
    }, new Map<Track['uid'], Track>());

    const wrs = records
      .map(
        (wr) => {
          // FIXME: Make track name extraction a RegExp in UpdateWebhook or remove this completely
          const trackName = trackMapping.get(wr.track_uid)?.name ?? '';
          return `${trackName.split(' - ')?.at(trackName.split(' - ').length - 2) ?? trackName} | ${
            formatScore(wr.score)
          } by ${
            escapeMarkdown(
              wr.user.name,
            )
          }${getEmojiFlag(wr.user)}`;
        },
      );

    const wrRankings = stats.leaderboard.map(
      ({ user, wrs }) => `${escapeMarkdown(user.name)}${getEmojiFlag(user)} (${wrs})`,
    );

    const campaignRankings = rankings.map(
      ({ user, points }) => `${escapeMarkdown(user.name)}${getEmojiFlag(user)} (${points})`,
    );

    return {
      content: [
        `**${campaign.name} - World Records**\n${wrs.join('\n')}`,
        `**${campaign.name} - WR Rankings**\n${wrRankings.join('\n')}`,
        `**${campaign.name} - Campaign Rankings**\n${campaignRankings.join('\n')}`,
      ].join('\n\n'),
    };
  }
}
