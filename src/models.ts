// Copyright (c) 2023, NeKz
// SPDX-License-Identifier: MIT

import { Zone } from './api.ts';

export type Campaign = {
  uid: string;
  name: string;
  event: {
    startsAt: number;
    endsAt: number;
  };
};

export type Track = {
  campaign_uid: string;
  uid: string;
  id: string;
  name: string;
  thumbnail: string;
};

export type TrackRecord = {
  uid: string;
  campaign_uid: string;
  track_uid: string;
  user: {
    id: string;
    name: string;
    zone: Zone[];
  };
  date: string;
  score: number;
  delta: number;
};
