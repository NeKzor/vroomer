// Copyright (c) 2024, NeKz
// SPDX-License-Identifier: MIT

import { Handlers, PageProps } from '$fresh/server.ts';
import { Head } from '$fresh/runtime.ts';
import { Campaign, Track, TrackRecord } from '../../../../../src/models.ts';
import { formatScore } from '../../../../../src/utils.ts';
import { getEmojiFlag } from '../../../../../src/utils.ts';
import { db } from '../../../../db.ts';

interface TrackData {
  track: Track;
  records: TrackRecord[];
}

export const handler: Handlers<TrackData> = {
  async GET(_req, ctx) {
    const track = (await db.get<Track>([
      'tracks',
      ctx.params.campaign_uid,
      ctx.params.track_uid,
    ]))
      .value;
    if (!track) {
      return ctx.renderNotFound();
    }

    const records: TrackRecord[] = [];
    for await (
      const { value } of db.list<TrackRecord>({
        prefix: ['records', track.campaign_uid, track.uid],
      })
    ) {
      records.push(value);
    }
    return ctx.render({ track, records });
  },
};

export default function Track(props: PageProps<TrackData>) {
  return (
    <div class='max-w-screen-md mx-auto flex flex-col items-center justify-center'>
      <Head>
        <title>{props.data.track.name}</title>
      </Head>
      <div className='overflow-x-auto'>
        <table className='table'>
          <thead>
            <tr>
              <th>Date</th>
              <th>Track</th>
              <th>Player</th>
              <th>Time</th>
              <th>Improvement</th>
            </tr>
          </thead>
          <tbody>
            {props.data.records.map((record) => {
              return (
                <tr>
                  <td>{new Date(record.date).toLocaleString()}</td>
                  <td>
                    <div className='flex gap-2'>
                      <img
                        src={`https://prod.trackmania.core.nadeo.online/storageObjects/${props.data.track.thumbnail}.jpg`}
                        height='32px'
                        width='32px'
                      />
                      <span>
                        <a
                          href={`/campaigns/${props.data.track.campaign_uid}/tracks/${props.data.track.uid}`}
                        >
                          {props.data.track.name}
                        </a>
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
                  <td>-{formatScore(record.delta)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
