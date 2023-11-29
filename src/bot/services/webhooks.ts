// Copyright (c) 2023, NeKz
// SPDX-License-Identifier: MIT

import { db } from './db.ts';

export type UpdateWebhook = {
  id: string;
  created_at: number;
  club_id: number;
  name: string;
  webhook_id: bigint;
  webhook_url: string;
  ranking_webhook_id: bigint;
  ranking_webhook_url: string;
  ranking_message_id: bigint;
  ranking_message_cache: string;
};

export const Webhooks = {
  Updates: [] as UpdateWebhook[],

  async load() {
    const campaigns: UpdateWebhook[] = [];

    for await (const update of db.list<UpdateWebhook>({ prefix: ['webhook_updates'] })) {
      campaigns.push(update.value);
    }

    this.Updates = campaigns.sort((a, b) => {
      return a.name.localeCompare(b.name);
    });
  },
};
