// Copyright (c) 2023, NeKz
// SPDX-License-Identifier: MIT

import { TrackmaniaOAuthClient } from './api.ts';

export class NameResolver {
  constructor(
    public oauthClient: TrackmaniaOAuthClient,
    public cache = new Map<string, string>(),
  ) {}

  async get(accountId: string) {
    let name = this.cache.get(accountId);
    if (name !== undefined) {
      return name;
    }

    const displayNames = await this.oauthClient.displayNames([accountId]);
    name = displayNames[accountId] ?? '';
    this.cache.set(accountId, name);
    return name;
  }
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

    const displayNames = await this.oauthClient.displayNames(toResolve);
    toResolve.forEach((accountId) => {
      const name = displayNames[accountId] ?? '';
      this.cache.set(accountId, name);
      return name;
    });
  }
}
