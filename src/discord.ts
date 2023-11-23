// Copyright (c) 2023, NeKz
// SPDX-License-Identifier: MIT

import * as flags from 'https://esm.sh/country-flag-emoji@1.0.3';
import { Campaign, Track, TrackRecord } from './models.ts';
import { Zone, ZoneType } from './api.ts';

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
      throw new Error(`Failed to execute webhook : ${res.status} : ${await res.text()}`);
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
      throw new Error(`Failed to edit webhook : ${res.status} : ${await res.text()}`);
    }
  }
  static buildRecordMessage({ wr, track }: MessageRecordBuildData): Record<string, unknown> {
    const country = wr.user.zone[2] ? wr.user.zone[2].name : null;
    const countryFlag = country ? flags.list.find((flag: { name: string }) => flag.name === country) : null;

    return {
      embeds: [
        {
          title: track.name.replace(/(\$[0-9a-fA-F]{3}|\$[WNOITSGZBEMwnoitsgzbem]{1})/g, ''),
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
              value: escapeMarkdown(wr.user.name) + (countryFlag ? ' ' + countryFlag.emoji : ''),
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

const formatScore = (score: number | undefined | null) => {
  if (score === undefined || score === null) {
    return '';
  }

  const msec = score % 1000;
  const tsec = Math.floor(score / 1000);
  const sec = tsec % 60;
  const min = Math.floor(tsec / 60);

  return (
    (min > 0 ? min + ':' : '') +
    (sec < 10 && min > 0 ? '0' + sec : sec) +
    '.' +
    (msec < 100 ? (msec < 10 ? '00' + msec : '0' + msec) : msec)
  );
};

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

const escapeMarkdown = (text: string) => {
  return specialMdCharacters.reduce(
    (title, char) => title.replaceAll(char, `\\${char}`),
    text,
  );
};

const getEmojiFlag = (user: TrackRecord['user']) => {
  const country = user.zone[ZoneType.Country] ? user.zone[ZoneType.Country].name : null;
  const flag = country ? flags.list.find((flag: { name: string }) => flag.name === country) : null;
  return flag ? ' ' + flag.emoji : '';
};
