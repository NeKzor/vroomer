// Copyright (c) 2024, NeKz
// SPDX-License-Identifier: MIT

import { Handlers, PageProps } from '$fresh/server.ts';
import { Campaign, Track, TrackRecord } from '../../../src/models.ts';
import { formatScore } from '../../../src/utils.ts';
import { getEmojiFlag } from '../../../src/utils.ts';
import { db } from '../../db.ts';

interface CampaignData {
  campaign: Campaign;
  tracks: Map<string, Track>;
  records: TrackRecord[];
}

export const handler: Handlers<CampaignData> = {
  async GET(_req, ctx) {
    const campaign = (await db.get<Campaign>(['campaigns', ctx.params.uid])).value;
    if (!campaign) {
      return ctx.renderNotFound();
    }

    const tracks = new Map<string, Track>();
    const records: TrackRecord[] = [];
    for await (
      const { value } of db.list<Track>({ prefix: ['tracks', campaign.uid] })
    ) {
      tracks.set(value.uid, value);
    }
    for await (
      const { value } of db.list<TrackRecord>({
        prefix: ['records', campaign.uid],
      })
    ) {
      records.push(value);
    }
    return ctx.render({ campaign, tracks, records });
  },
};

export default function Campaign(props: PageProps<CampaignData>) {
  return (
    <div class='max-w-screen-md mx-auto flex flex-col items-center justify-center'>
      <div className='overflow-x-auto'>
        <table className='table'>
          <thead>
            <tr>
              <th className="table-auto">Date</th>
              <th>Track</th>
              <th>Player</th>
              <th>Time</th>
              <th>Improvement</th>
            </tr>
          </thead>
          <tbody>
            {props.data.records.map((record) => {
              const track = props.data.tracks.get(record.track_uid)!;
              return (
                <tr>
                  <td>{new Date(record.date).toLocaleString()}</td>
                  <td>
                    <div className='flex gap-2'>
                      <img
                        src={`https://prod.trackmania.core.nadeo.online/storageObjects/${track.thumbnail}.jpg`}
                        height='32px'
                        width='32px'
                      />
                      <span>
                        <a href={`/campaigns/${track.campaign_uid}/tracks/${track.uid}`}>{track.name}</a>
                      </span>
                    </div>
                  </td>
                  <td>
                    <span
                      className='w-[16px] inline-block'
                      title={record.user.zone.at(2)?.name}
                    >
                      {getEmojiFlag(record.user)}
                    </span>
                    <span className='pl-4'>{record.user.name}</span>
                  </td>
                  <td>{formatScore(record.score)}</td>
                  <td>{record.delta ? '-' + formatScore(record.delta) : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
