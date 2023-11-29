// Copyright (c) 2023, NeKz
// SPDX-License-Identifier: MIT

import { TrackmaniaClient, TrackmaniaClientToken, UbisoftClient, UbisoftClientSession } from './api.ts';

export class Session {
  constructor(public config: { loginFile: string | null }) {}

  memory = {
    ubisoft: {
      loginData: null as UbisoftClientSession | null,
    },
    trackmania: {
      loginData: null as TrackmaniaClientToken | null,
      loginDataNadeo: null as TrackmaniaClientToken | null,
    },
  };

  async restore(ubisoft: UbisoftClient, trackmania: TrackmaniaClient) {
    if (this.config.loginFile) {
      try {
        const login = JSON.parse(await Deno.readTextFile(this.config.loginFile)) as Session['memory'];
        ubisoft.loginData = login.ubisoft.loginData;
        trackmania.loginData = login.trackmania.loginData;
        trackmania.loginDataNadeo = login.trackmania.loginDataNadeo;
      } catch (err) {
        if (err instanceof Deno.errors.NotFound) {
          return false;
        }
        return err;
      }
      return true;
    }
  }
  async save(ubisoft: UbisoftClient, trackmania: TrackmaniaClient) {
    if (this.config.loginFile) {
      await Deno.writeTextFile(
        this.config.loginFile,
        JSON.stringify(
          {
            ubisoft: {
              loginData: ubisoft.loginData,
            },
            trackmania: {
              loginData: trackmania.loginData,
              loginDataNadeo: trackmania.loginDataNadeo,
            },
          } satisfies Session['memory'],
        ),
      );
    } else {
      this.memory.ubisoft.loginData = ubisoft.loginData;
      this.memory.ubisoft.loginData = ubisoft.loginData;
      this.memory.trackmania.loginData = trackmania.loginData;
      this.memory.trackmania.loginDataNadeo = trackmania.loginDataNadeo;
    }
  }
}
