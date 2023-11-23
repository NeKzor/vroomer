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
  public url: string;
  public optimizeDataUsage: boolean;
  public lastCachedMessage: string;
  public messageBuilder: (data: MessageBuilderData) => Record<string, unknown>;

  constructor(
    options: {
      url: string;
      optimizeDataUsage?: boolean;
      messageBuilder: (data: MessageBuilderData) => Record<string, unknown>;
    },
  ) {
    this.url = options.url;
    this.optimizeDataUsage = options.optimizeDataUsage ?? false;
    this.lastCachedMessage = '';
    this.messageBuilder = options.messageBuilder;
  }
  async send(data: MessageBuilderData) {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(this.messageBuilder(data)),
    });

    if (!res.ok) {
      throw new Error(
        `Failed to execute webhook : ${res.status} : ${await res.text()}`,
      );
    }
  }
  async edit(messageId: string, data: MessageBuilderData) {
    const message = JSON.stringify(this.messageBuilder(data));
    if (this.optimizeDataUsage) {
      if (this.lastCachedMessage === message) {
        return;
      }
      this.lastCachedMessage = message;
    }

    const res = await fetch(`${this.url}/messages/${messageId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(this.messageBuilder(data)),
    });

    if (!res.ok) {
      throw new Error(
        `Failed to edit webhook : ${res.status} : ${await res.text()}`,
      );
    }
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
    const trackNames = tracks.reduce((names, track) => {
      names.set(track.uid, track.name);
      return names;
    }, new Map<string, string>());

    const wrs = records
      .map(
        (wr) =>
          `${trackNames.get(wr.track_uid)?.split(' - ')?.at(1) ?? ''} | ${formatScore(wr.score)} by ${
            escapeMarkdown(
              wr.user.name,
            )
          }${getEmojiFlag(wr.user)}`,
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
