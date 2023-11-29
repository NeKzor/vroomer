// Copyright (c) 2023, NeKz
// SPDX-License-Identifier: MIT

import { load } from 'dotenv/mod.ts';
import { join } from 'path/mod.ts';
import {
  Audiences,
  ClubActivity,
  TrackmaniaClient,
  TrackmaniaOAuthClient,
  UbisoftApplication,
  UbisoftClient,
  Zone,
  Zones,
} from './api.ts';
import { DiscordWebhook } from './discord.ts';
import { flushFileLogger, logFetchRequest, logger } from './logger.ts';
import { Campaign, Track, TrackRecord } from './models.ts';
import { generateStats } from './stats.ts';
import { NameResolver } from './resolver.ts';
import { Session } from './session.ts';
import type { UpdateWebhook } from './bot/services/webhooks.ts';
import { db } from './bot/services/db.ts';

const isUsingDenoDeploy = Deno.env.get('DENO_DEPLOYMENT_ID') !== undefined;
if (!isUsingDenoDeploy) {
  await load({ export: true });
}

const isUsingSingleClubMode = Deno.env.get('CLUB_ID')! !== 'none';

const kv = await Deno.openKv(isUsingDenoDeploy ? undefined : './.kv');

const session = new Session({
  loginFile: isUsingDenoDeploy ? null : '.login',
});

const ubisoft = new UbisoftClient({
  applicationId: UbisoftApplication.Trackmania,
  email: Deno.env.get('UBI_EMAIL')!,
  password: Deno.env.get('UBI_PW')!,
  onFetch: logFetchRequest,
});

const trackmania = new TrackmaniaClient({
  onFetch: logFetchRequest,
});

const discordRecordUpdate = new DiscordWebhook({
  messageBuilder: DiscordWebhook.buildRecordMessage,
  onFetch: logFetchRequest,
});

const discordCampaignUpdate = new DiscordWebhook({
  messageBuilder: DiscordWebhook.buildRankingsMessage,
  onFetch: logFetchRequest,
});

const webhookRecordUpdateUrl = Deno.env.get('DISCORD_WEBHOOK_RECORD_UPDATE')!;
let discordCampaignUpdateCache: string | undefined = '';

const nameResolver = new NameResolver(
  new TrackmaniaOAuthClient({
    id: Deno.env.get('TRACKMANIA_CLIENT_ID')!,
    secret: Deno.env.get('TRACKMANIA_CLIENT_SECRET')!,
  }),
);

const replayStoragePath = Deno.env.get('REPLAY_STORAGE_PATH')!;
if (replayStoragePath !== 'none') {
  const { state } = await Deno.permissions.query({ name: 'write', path: replayStoragePath });
  if (state !== 'granted') {
    logger.error('Write permission to replay storage path is required!', { replayStoragePath, state });
    Deno.exit(1);
  }
}

await session.restore(ubisoft, trackmania);

interface Context {
  trackmania: TrackmaniaClient;
  zones: Zones;
}

const update = async () => {
  try {
    const newUbisoftLogin = await ubisoft.login();
    const newTrackmaniaLogin = await trackmania.login(ubisoft.loginData!.ticket);
    const newTrackmaniaNadeoLogin = await trackmania.loginNadeo(Audiences.NadeoLiveServices);

    logger.info({ newUbisoftLogin, newTrackmaniaLogin, newTrackmaniaNadeoLogin });

    if (newUbisoftLogin || newTrackmaniaLogin || newTrackmaniaNadeoLogin) {
      await session.save(ubisoft, trackmania);
    }

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
    };

    await updateClub(context);
  } catch (err) {
    logger.error(err);
  }
};

// TODO: Remove once Deno Deploy supports Array.fromAsync
const fromAsync = async <T, U>(
  iterableOrArrayLike: AsyncIterable<T>,
  mapFn: (value: Awaited<T>) => U,
): Promise<U[]> => {
  const result: U[] = [];
  for await (const entry of iterableOrArrayLike as AsyncIterable<T>) {
    result.push(mapFn(entry));
  }
  return result;
};

const createActivityMatcher = (clubCampaignName: string, clubCampaignNameRegex: RegExp | string | null) =>
  clubCampaignName === 'latest'
    ? (activity: ClubActivity) => activity.activityType === 'campaign'
    : clubCampaignNameRegex instanceof RegExp
    ? (activity: ClubActivity) => activity.activityType === 'campaign' && clubCampaignNameRegex.test(activity.name)
    : (activity: ClubActivity) => activity.activityType === 'campaign' && activity.name === clubCampaignName;

const updateClub = async (ctx: Context) => {
  if (isUsingSingleClubMode) {
    const clubId = Deno.env.get('CLUB_ID')!;
    const campaignName = Deno.env.get('CLUB_CAMPAIGN_NAME')!;
    const isCampaignRegex = campaignName.at(0) === '/' && campaignName.at(-1) === '/';
    const campaignNameRegex = isCampaignRegex ? new RegExp(campaignName.slice(1, -1)) : null;
    const matchActivity = createActivityMatcher(campaignName, campaignNameRegex);

    const activity = await ctx.trackmania.clubActivity(clubId);

    const latestCampaignActivity = activity.activityList.find(matchActivity);
    if (!latestCampaignActivity) {
      logger.warning(`No match for campaign "${campaignName}" of club ${clubId}.`);
      return;
    }

    if (webhookRecordUpdateUrl === 'none') {
      logger.warning(`CLUB_ID is set but DISCORD_WEBHOOK_RECORD_UPDATE cannot be "none".`);
      return;
    }

    const result = await updateCampaign(ctx, clubId, latestCampaignActivity.campaignId, webhookRecordUpdateUrl);
    if (result) {
      const [campaign, trackWrs, trackHistory] = result;
      await sendCampaignUpdate(ctx, campaign, trackWrs, trackHistory);
    }
  } else {
    for await (const webhook of kv.list<UpdateWebhook>({ prefix: ['webhook_updates'] })) {
      try {
        const campaignName = webhook.value.name;
        const isCampaignRegex = campaignName.startsWith('regex:');
        const campaignNameRegex = isCampaignRegex ? new RegExp(campaignName.slice('regex:'.length)) : campaignName;
        const matchActivity = createActivityMatcher(campaignName, campaignNameRegex);

        const activity = await ctx.trackmania.clubActivity(webhook.value.club_id.toString());

        const campaignActivities = campaignName === 'latest'
          ? [activity.activityList.find(matchActivity)].filter(Boolean) as ClubActivity[]
          : activity.activityList.filter(matchActivity);

        if (!campaignActivities.length) {
          logger.warning(
            `No match for campaign "${campaignName}" of club ${webhook.value.club_id} : (id: ${webhook.value.id}).`,
          );
          return;
        }

        for (const campaignActivity of campaignActivities) {
          const result = await updateCampaign(
            ctx,
            webhook.value.club_id.toString(),
            campaignActivity.campaignId,
            webhook.value.webhook_url,
          );

          if (result) {
            const [campaign, trackWrs, trackHistory] = result;
            await sendCampaignUpdate(ctx, campaign, trackWrs, trackHistory, webhook);
          }
        }
      } catch (err) {
        logger.error(err);
      }
    }
  }
};

const updateCampaign = async (
  ctx: Context,
  clubId: string,
  campaignId: string,
  webhookUrl: string,
): Promise<
  [campaign: Campaign, trackWrs: Map<string, TrackRecord[]>, trackHistory: Map<string, TrackRecord[]>] | false
> => {
  const clubCampaign = await ctx.trackmania.clubCampaign(clubId, campaignId);
  const { seasonUid, name, playlist, startTimestamp, endTimestamp } = clubCampaign.campaign;

  const campaignKey = ['campaigns', seasonUid];
  let campaign = (await kv.get<Campaign>(campaignKey)).value;

  const tracks = campaign
    ? await fromAsync(kv.list<Track>({ prefix: ['tracks', campaign.uid] }), ({ value }) => value)
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
    logger.warning(`Failed to find or create campaign ${name}.`);
    return false;
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
      logger.warning(`Failed to find or create track ${name}.`);
      continue;
    }

    const [wrs, history, newUpdates] = await updateRecords(ctx, campaign, track, mapId, webhookUrl);

    trackWrs.set(track.uid, wrs);
    trackHistory.set(track.uid, history);
    updates += newUpdates;
  }

  return [campaign, trackWrs, trackHistory];
};

const updateRecords = async (
  ctx: Context,
  campaign: Campaign,
  track: Track,
  mapId: string,
  webhookUrl: string,
): Promise<[wrs: TrackRecord[], history: TrackRecord[], updates: number]> => {
  const worldLeaderboard = (await ctx.trackmania.leaderboard(campaign.uid, track.uid, 0, 5)).tops.at(0);

  let updates = 0;
  let wrScore = undefined;

  const recordsKey = ['records', campaign.uid, track.uid];
  const latestScore = Math.min(
    ...await fromAsync(kv.list<TrackRecord>({ prefix: recordsKey }), ({ value }) => value.score),
  );

  for (const { accountId, zoneId, score } of worldLeaderboard?.top ?? []) {
    if (wrScore === undefined || wrScore === score) {
      wrScore = score;

      const [record] = await ctx.trackmania.mapRecords([accountId], [mapId]);
      if (!record) {
        logger.error(`Failed to retrieve map record from ${accountId} on ${mapId}.`);
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
        .enqueue({ type: 'wr', wr, track, campaign, webhookUrl } satisfies WrQueueMessage)
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
  webhook?: Deno.KvEntry<UpdateWebhook>,
) => {
  try {
    const topWorldRankings = (await ctx.trackmania.leaderboard(campaign.uid, undefined, 0, 5)).tops?.at(0)?.top ?? [];
    await nameResolver.downloadAll(
      topWorldRankings.map((ranking) => ranking.accountId),
    );

    const data = {
      campaign,
      tracks: await fromAsync(kv.list<Track>({ prefix: ['tracks', campaign.uid] }), ({ value }) => value),
      records: await fromAsync(
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

    if (isUsingSingleClubMode) {
      const messageId = Deno.env.get('DISCORD_CAMPAIGN_UPDATE_MESSAGE_ID')!;
      switch (messageId) {
        case 'fixme': {
          discordCampaignUpdateCache = await discordCampaignUpdate.edit(
            Deno.env.get('DISCORD_WEBHOOK_CAMPAIGN_UPDATE')!,
            messageId,
            data,
            discordCampaignUpdateCache,
          );
          break;
        }
        default: {
          discordCampaignUpdateCache = await discordCampaignUpdate.send(
            Deno.env.get('DISCORD_WEBHOOK_CAMPAIGN_UPDATE')!,
            data,
          );
          break;
        }
      }
    } else {
      const body = await discordCampaignUpdate.edit(
        webhook!.value.ranking_webhook_url,
        webhook!.value.ranking_message_id.toString(),
        data,
        webhook!.value.ranking_message_cache,
      );

      if (body) {
        webhook!.value.ranking_message_cache = body;

        await db.atomic()
          .check(webhook!)
          .set(webhook!.key, webhook!.value)
          .commit();
      }
    }
  } catch (err) {
    logger.error(err);
  }
};

type WrQueueMessage = {
  type: 'wr';
  wr: TrackRecord;
  track: Track;
  campaign: Campaign;
  webhookUrl: string;
};

type QueueMessages = WrQueueMessage;

kv.listenQueue(async (message) => {
  const { type, wr, track, campaign, webhookUrl } = message as QueueMessages;

  switch (type) {
    case 'wr': {
      try {
        logger.info('NEW RECORD', wr.user.name, wr.score);
        await discordRecordUpdate.send(webhookUrl, { wr, track });
      } catch (err) {
        logger.error(err);
      }

      if (replayStoragePath !== 'none') {
        let file: Deno.FsFile | undefined;
        try {
          const folderPath = join(replayStoragePath, campaign.uid, track.uid);
          await Deno.mkdir(folderPath, { recursive: true });

          const fileName = [track.name, wr.score, wr.user.name, wr.uid]
            .join('_')
            .replaceAll(/[\\/ ]/g, '_') + '.replay.gbx';

          file = await Deno.open(join(folderPath, fileName), { write: true, createNew: true });

          const url = `https://prod.trackmania.core.nadeo.online/storageObjects/${wr.uid}`;

          logger.info(`[GET] ${url}`);
          const res = await fetch(url);
          logger.info(`[GET] ${url} : ${res.status}`);

          await res.body?.pipeTo(file.writable);
        } catch (err) {
          logger.error(err);
        } finally {
          try {
            file?.close();
            // deno-lint-ignore no-empty
          } catch {}
        }
      }
      break;
    }
  }

  flushFileLogger();
});

Deno.cron('Update', '*/1 * * * *', { backoffSchedule: [30_000] }, async () => {
  logger.info('Updating');
  await update();
  flushFileLogger();
});
