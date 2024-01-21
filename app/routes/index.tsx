// Copyright (c) 2024, NeKz
// SPDX-License-Identifier: MIT

import { db } from '../db.ts';
import { Handlers, PageProps } from '$fresh/server.ts';
import { Campaign } from '../../src/models.ts';

interface IndexData {
  campaigns: Campaign[];
}

export const handler: Handlers<IndexData> = {
  async GET(_req, ctx) {
    const campaigns: Campaign[] = [];
    for await (
      const { value } of db.list<Campaign>({ prefix: ['campaigns'] })
    ) {
      campaigns.push(value);
    }
    return ctx.render({ campaigns });
  },
};

export default function Home(props: PageProps<IndexData>) {
  return (
    <div class='max-w-screen-md mx-auto flex flex-col items-center justify-center'>
      <div className='overflow-x-auto'>
        <table className='table'>
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody>
            {props.data.campaigns.map((campaign) => {
              return (
                <tr>
                  <td>
                    <a href={`/campaigns/${campaign.uid}`}>{campaign.name}</a>
                  </td>
                  <td>{new Date(campaign.event.startsAt * 1_000).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
