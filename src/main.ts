// Copyright (c) 2023, NeKz
// SPDX-License-Identifier: MIT

import { load } from 'dotenv/mod.ts';
import { Temporal } from '@js-temporal/polyfill';
import { Audiences, ClubActivity, TrackmaniaClient, TrackmaniaOAuthClient, UbisoftClient, Zone, Zones } from './api.ts';
import { DiscordWebhook } from './discord.ts';
import { logger } from './logger.ts';
import { Campaign, Track, TrackRecord } from './models.ts';
import { generateStats } from './stats.ts';

const isUsingDenoDeploy = Deno.env.get('DENO_DEPLOYMENT_ID') !== undefined;
if (!isUsingDenoDeploy) {
  await load({ export: true });
}

const kv = await Deno.openKv(isUsingDenoDeploy ? undefined : './.kv');

const session = {
  file: '.login',

  async tryLoad(client: UbisoftClient) {
    try {
      client.loginData = JSON.parse(await Deno.readTextFile(this.file));

      const now = Temporal.Now.instant();
      const then = Temporal.Instant.from(client.loginData.expiration);
      const ago = then.until(now);
      const isExpired = ago.seconds <= 0;
      return isExpired;
    } catch {
      return false;
    }
  },

  async save(client: UbisoftClient) {
    await Deno.writeTextFile(this.file, JSON.stringify(client.loginData));
  },
};

const oauthClient = new TrackmaniaOAuthClient({
  id: Deno.env.get('TRACKMANIA_CLIENT_ID')!,
  secret: Deno.env.get('TRACKMANIA_CLIENT_SECRET')!,
});

const nameResolver = {
  cache: new Map<string, string>(),

  async get(accountId: string) {
    let name = this.cache.get(accountId);
    if (name !== undefined) {
      return name;
    }

    const displayNames = await oauthClient.displayNames([accountId]);
    name = displayNames[accountId] ?? '';
    this.cache.set(accountId, name);
    return name;
  },
  async downloadAll(accountIds: string[]) {
    if (accountIds.length === 0) {
      return;
    }

    const names = accountIds
      .map((accountId) => [accountId, this.cache.get(accountId)]) as [string, string | undefined][];

    const toResolve = names
      .filter(([_, name]) => name === undefined)
      .map(([accountId]) => accountId);

    if (toResolve.length === 0) {
      return;
    }

    const displayNames = await oauthClient.displayNames(toResolve);
    toResolve.forEach((accountId) => {
      const name = displayNames[accountId] ?? '';
      this.cache.set(accountId, name);
      return name;
    });
  },
};

const discordRecordUpdate = new DiscordWebhook({
  url: Deno.env.get('DISCORD_WEBHOOK_RECORD_UPDATE')!,
  messageBuilder: DiscordWebhook.buildRecordMessage,
});
const discordCampaignUpdate = new DiscordWebhook({
  url: Deno.env.get('DISCORD_WEBHOOK_CAMPAIGN_UPDATE')!,
  optimizeDataUsage: true,
  messageBuilder: DiscordWebhook.buildRankingsMessage,
});

const clubId = Deno.env.get('CLUB_ID')!;
const clubCampaignName = Deno.env.get('CLUB_CAMPAIGN_NAME')!;
const isClubCampaignRegex = clubCampaignName.at(0) === '/' && clubCampaignName.at(-1) === '/';
const clubCampaignNameRegex = isClubCampaignRegex ? new RegExp(clubCampaignName.slice(1, -1)) : null;
const latestCampaignOrByName = clubCampaignName === 'latest'
  ? (activity: ClubActivity) => activity.activityType === 'campaign'
  : clubCampaignNameRegex
  ? (activity: ClubActivity) => activity.activityType === 'campaign' && clubCampaignNameRegex.test(activity.name)
  : (activity: ClubActivity) => activity.activityType === 'campaign' && activity.name === clubCampaignName;

interface Context {
  trackmania: TrackmaniaClient;
  zones: Zones;
  clubId: string;
  clubCampaignName: string;
}
const update = async () => {
  const ubisoft = new UbisoftClient({
    email: Deno.env.get('UBI_EMAIL')!,
    password: Deno.env.get('UBI_PW')!,
  });

  try {
    if (!await session.tryLoad(ubisoft)) {
      await ubisoft.login();
      await session.save(ubisoft);
    }

    const trackmania = new TrackmaniaClient(ubisoft.loginData.ticket);

    await trackmania.login();
    await trackmania.loginNadeo(Audiences.NadeoLiveServices);

    const zones = await trackmania.zones();
    const allowedKeys: (keyof Zone)[] = ['name', 'parentId', 'zoneId'];

    zones.data.forEach((zone) => {
      (Object.keys(zone) as (keyof Zone)[]).forEach((key) => {
        if (!allowedKeys.includes(key)) {
          delete zone[key];
        }
      });
    });

    nameResolver.cache.clear();

    const context: Context = {
      trackmania,
      zones,
      clubId,
      clubCampaignName,
    };

    await updateCampaign(context);
  } catch (err) {
    logger.error(err);
  }
};

const updateCampaign = async (ctx: Context) => {
  const activity = await ctx.trackmania.clubActivity(clubId);

  const latestCampaignActivity = activity.activityList.find(latestCampaignOrByName);
  if (!latestCampaignActivity) {
    logger.warning(`Campaign "${ctx.clubCampaignName}" not found.`);
    return;
  }

  const { campaign } = await ctx.trackmania.clubCampaign(clubId, latestCampaignActivity.campaignId);
  const campaigns = [campaign];

  for (const { seasonUid, name, playlist, startTimestamp, endTimestamp } of campaigns) {
    const campaignKey = ['campaigns', seasonUid];
    let campaign = (await kv.get<Campaign>(campaignKey)).value;

    const tracks = campaign
      ? await Array.fromAsync(kv.list<Track>({ prefix: ['tracks', campaign.uid] }), ({ value }) => value)
      : [];

    if (!campaign) {
      const result = await kv.set(campaignKey, {
        uid: seasonUid,
        name,
        event: {
          startsAt: startTimestamp,
          endsAt: endTimestamp,
        },
      });

      if (result.ok) {
        campaign = (await kv.get<Campaign>(campaignKey)).value;
      }
    }

    if (!campaign) {
      logger.warning(`Failed to find or create campaign ${name}`);
      continue;
    }

    let updates = 0;

    const maps = await ctx.trackmania.maps(playlist.map((map) => map.mapUid));

    const trackWrs = new Map<string, TrackRecord[]>();
    const trackHistory = new Map<string, TrackRecord[]>();

    for (const { mapUid } of playlist) {
      const { name, mapId, thumbnailUrl } = maps.find((map) => map.mapUid === mapUid);
      logger.info(name, mapUid);

      let track = tracks.find((track) => track.uid === mapUid) ?? null;
      if (!track) {
        const trackKey = ['tracks', campaign.uid, mapUid];

        const result = await kv.set(trackKey, {
          campaign_uid: campaign.uid,
          uid: mapUid,
          id: mapId,
          name,
          thumbnail: thumbnailUrl.slice(thumbnailUrl.lastIndexOf('/') + 1, -4),
        });

        if (result.ok) {
          track = (await kv.get<Track>(trackKey)).value;
        }
      }

      if (!track) {
        logger.warning(`Failed to find or create track ${name}`);
        continue;
      }

      const [wrs, history, newUpdates] = await updateRecords(ctx, campaign, track, mapId);

      trackWrs.set(track.uid, wrs);
      trackHistory.set(track.uid, history);
      updates += newUpdates;
    }

    await sendCampaignUpdate(ctx, campaign, trackWrs, trackHistory);
  }
};

const updateRecords = async (
  ctx: Context,
  campaign: Campaign,
  track: Track,
  mapId: string,
): Promise<[wrs: TrackRecord[], history: TrackRecord[], updates: number]> => {
  const worldLeaderboard = (await ctx.trackmania.leaderboard(campaign.uid, track.uid, 0, 5)).tops.at(0);

  let updates = 0;
  let wrScore = undefined;

  const recordsKey = ['records', campaign.uid, track.uid];
  const latestScore = Math.min(
    ...await Array.fromAsync(kv.list<TrackRecord>({ prefix: recordsKey }), ({ value }) => value.score),
  );

  for (const { accountId, zoneId, score } of worldLeaderboard?.top ?? []) {
    if (wrScore === undefined || wrScore === score) {
      wrScore = score;

      const [record] = await ctx.trackmania.mapRecords([accountId], [mapId]);
      if (!record) {
        logger.error(`Failed to retrieve map record from ${accountId} on ${mapId}`);
        continue;
      }

      const uid = record.url.slice(record.url.lastIndexOf('/') + 1);

      const wr: TrackRecord = {
        uid,
        campaign_uid: campaign.uid,
        track_uid: track.uid,
        user: {
          id: accountId,
          name: await nameResolver.get(accountId),
          zone: ctx.zones.search(zoneId),
        },
        date: record.timestamp,
        score,
        delta: Math.abs(isFinite(latestScore) ? score - latestScore : 0),
      };

      const key = ['records', campaign.uid, track.uid, wr.uid];

      const result = await kv.atomic()
        .check({ key, versionstamp: null })
        .set(key, wr)
        .enqueue({ type: 'wr', wr, track })
        .commit();

      if (result.ok) {
        ++updates;
      }
    }
  }

  const wrs: TrackRecord[] = [];
  const history: TrackRecord[] = [];

  for await (const wr of kv.list<TrackRecord>({ prefix: recordsKey })) {
    if (wr.value.score === wrScore) {
      wrs.push(wr.value);
    }

    history.push(wr.value);
  }

  return [wrs, history, updates];
};

const sendCampaignUpdate = async (
  ctx: Context,
  campaign: Campaign,
  trackWrs: Map<string, TrackRecord[]>,
  trackHistory: Map<string, TrackRecord[]>,
) => {
  try {
    const topWorldRankings = (await ctx.trackmania.leaderboard(campaign.uid, undefined, 0, 5)).tops?.at(0)?.top ?? [];
    await nameResolver.downloadAll(
      topWorldRankings.map((ranking) => ranking.accountId),
    );

    const data = {
      campaign,
      tracks: await Array.fromAsync(kv.list<Track>({ prefix: ['tracks', campaign.uid] }), ({ value }) => value),
      records: await Array.fromAsync(
        kv.list<TrackRecord>({ prefix: ['records', campaign.uid] }),
        ({ value }) => value,
      ),
      rankings: topWorldRankings.map((ranking) => {
        return {
          user: {
            id: ranking.accountId,
            zone: ctx.zones.search(ranking.zoneId),
            name: nameResolver.cache.get(ranking.accountId) ?? '',
          },
          points: ranking.sp,
        };
      }),
      stats: generateStats(ctx.zones, trackWrs, trackHistory),
    };

    const messageId = Deno.env.get('DISCORD_CAMPAIGN_UPDATE_MESSAGE_ID')!;
    if (messageId !== 'fixme') {
      await discordCampaignUpdate.edit(messageId, data);
    } else {
      await discordCampaignUpdate.send(data);
    }
  } catch (err) {
    logger.error(err);
  }
};

kv.listenQueue(async (message) => {
  const { type, wr, track } = message as { type: 'wr'; wr: TrackRecord; track: Track };

  switch (type) {
    case 'wr': {
      try {
        logger.info('NEW RECORD', wr.user.name, wr.score);
        await discordRecordUpdate.send({ wr, track });
      } catch (err) {
        logger.error(err);
      }
      break;
    }
  }
});

Deno.cron('Update', '*/1 * * * *', async () => {
  logger.info('Updating');
  await update();
});
