// Copyright (c) 2023, NeKz
// SPDX-License-Identifier: MIT

import { Zone, Zones, ZoneType } from './api.ts';
import { TrackRecord } from './models.ts';

const createLeaderboard = (wrs: Map<string, TrackRecord[]>, zones: Zones): [{
  user: {
    date?: string | undefined;
    id: string;
    name: string;
    zone: Zone[];
  };
  wrs: number | undefined;
}[], {
  zone: Zone[];
  wrs: number;
}[]] => {
  const allWrs = [...wrs.values()].map((wrs) => wrs).flat();
  const users = allWrs.map(({ user, date }) => ({ ...user, date } as {
    date?: string;
    id: string;
    name: string;
    zone: Zone[];
  }));

  const frequency = users.reduce((count, user) => {
    count.set(user.id, (count.get(user.id) || 0) + 1);
    return count;
  }, new Map<string, number>());

  return [
    [...frequency
      .keys()]
      .sort((a, b) => frequency.get(b)! - frequency.get(a)!)
      .map((key) => {
        const user = users
          .filter((u) => u.id === key)
          .sort((a, b) => b.date!.localeCompare(a.date!))
          .at(0)!;

        delete user.date;

        return {
          user,
          wrs: frequency.get(key),
        };
      }),
    [
      ...new Set(
        users.map(
          (user) => (user.zone[ZoneType.Country] ? user.zone[ZoneType.Country] : user.zone[ZoneType.World])!.zoneId,
        ),
      ),
    ]
      .map((zoneId) => ({
        zone: zones.search(zoneId).slice(0, 3),
        wrs: users.filter(
          (user) =>
            (user.zone[ZoneType.Country] ? user.zone[ZoneType.Country] : user.zone[ZoneType.World])!.zoneId ===
              zoneId,
        ).length,
      }))
      .sort((a, b) => {
        const v1 = a.wrs;
        const v2 = b.wrs;
        return v1 === v2 ? 0 : v1 < v2 ? 1 : -1;
      }),
  ];
};

export const generateStats = (zones: Zones, wrs: Map<string, TrackRecord[]>, _history: Map<string, TrackRecord[]>) => {
  const [leaderboard] = createLeaderboard(wrs, zones);
  // const [leaderboard, countryLeaderboard] = createLeaderboard(wrs, zones);
  // const [historyLeaderboard, historyCountryLeaderboard] = createLeaderboard(history, zones);

  // const allUsers = [...history.values()].map((wrs) => wrs).flat().map(({ user, date }) => ({ ...user, date }));
  // const users = [...new Set(allUsers.map((user) => user.id))].map((id) =>
  //   allUsers.find((user) => user.id === id) as {
  //     date?: string;
  //     id: string;
  //     name: string;
  //     zone: Zone[];
  //   }
  // );

  // const frequency = users.reduce((count, user) => {
  //   count.set(user.id, (count.get(user.id) || 0) + 1);
  //   return count;
  // }, new Map<string, number>());

  // const uniqueLeaderboard = [...frequency.keys()]
  //   .sort((a, b) => frequency.get(b)! - frequency.get(a)!)
  //   .map((key) => {
  //     const user = users
  //       .filter((u) => u.id === key)
  //       .sort((a, b) => b.date!.localeCompare(a.date!))
  //       .at(0)!;

  //     delete user.date;

  //     return {
  //       user,
  //       wrs: frequency.get(key),
  //     };
  //   });
  // const uniqueCountryLeaderboard = [
  //   ...new Set(
  //     users.map((user) =>
  //       (user.zone[ZoneType.Country] ? user.zone[ZoneType.Country] : user.zone[ZoneType.World])!.zoneId
  //     ),
  //   ),
  // ]
  //   .map((zoneId) => ({
  //     zone: zones.search(zoneId).slice(0, 3),
  //     wrs: users.filter(
  //       (user) =>
  //         (user.zone[ZoneType.Country] ? user.zone[ZoneType.Country] : user.zone[ZoneType.World])!.zoneId === zoneId,
  //     ).length,
  //   }))
  //   .sort((a, b) => {
  //     const v1 = a.wrs;
  //     const v2 = b.wrs;
  //     return v1 === v2 ? 0 : v1 < v2 ? 1 : -1;
  //   });

  return {
    leaderboard,
    //countryLeaderboard,
    //historyLeaderboard,
    //historyCountryLeaderboard,
    //uniqueLeaderboard,
    //uniqueCountryLeaderboard,
  };
};
