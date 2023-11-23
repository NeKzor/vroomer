// Copyright (c) 2023, NeKz
// SPDX-License-Identifier: MIT

// deno-lint-ignore-file no-empty-interface no-explicit-any

export enum Audiences {
  NadeoLiveServices = 'NadeoLiveServices',
  NadeoClubServices = 'NadeoClubServices',
}

export class UbisoftClient {
  baseUrl: string;
  loginData: any;

  #auth: string;

  constructor(options: { email: string; password: string }) {
    this.baseUrl = 'https://public-ubiservices.ubi.com';
    this.loginData = null;
    this.#auth = btoa(`${options.email}:${options.password}`);
  }
  async login() {
    const res = await fetch(`${this.baseUrl}/v3/profiles/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ubi-AppId': '86263886-327a-4328-ac69-527f0d20a237',
        'Authorization': 'Basic ' + this.#auth,
      },
    });
    this.loginData = await res.json();

    return this;
  }
}

export enum ApiEndpoint {
  Prod = 'https://prod.trackmania.core.nadeo.online',
  LiveServices = 'https://live-services.trackmania.nadeo.live/api/token',
  Competition = 'https://competition.trackmania.nadeo.club/api',
}

export class TrackmaniaClient {
  #auth: string;
  #loginData: any | null;
  #loginDataNadeo: any | null;

  constructor(ticket: string) {
    this.#auth = ticket;
    this.#loginData = null;
    this.#loginDataNadeo = null;
  }
  async login() {
    const res = await fetch(`${ApiEndpoint.Prod}/v2/authentication/token/ubiservices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'ubi_v1 t=' + this.#auth,
      },
    });

    if (res.status !== 200) {
      throw new Error(await res.text());
    }

    this.#loginData = await res.json();

    return this;
  }
  async loginNadeo(audience?: Audiences) {
    if (!this.#loginData) {
      throw new Error('Client is not logged in. Did you forget to call login()?');
    }

    audience ??= Audiences.NadeoLiveServices;

    const res = await fetch(`${ApiEndpoint.Prod}/v2/authentication/token/nadeoservices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'nadeo_v1 t=' + this.#loginData.accessToken,
      },
      body: JSON.stringify({ audience }),
    });

    if (res.status !== 200) {
      throw new Error(await res.text());
    }

    this.#loginDataNadeo = await res.json();

    return this;
  }
  async refresh() {
    const res = await fetch(`${ApiEndpoint.Prod}/v2/authentication/token/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'nadeo_v1 t=' + this.#loginData.refreshToken,
      },
    });

    if (res.status !== 200) {
      throw new Error(await res.text());
    }

    return this;
  }
  async get<T>(route: string, nadeo = false, nadeoEndpoint = ApiEndpoint.LiveServices) {
    if (!nadeo && !this.#loginData) {
      throw new Error('need to be logged in first');
    }

    if (nadeo && !this.#loginDataNadeo) {
      throw new Error('need to be logged in with nadeo first');
    }

    const accessToken = nadeo ? this.#loginDataNadeo.accessToken : this.#loginData.accessToken;
    const baseUrl = nadeo ? nadeoEndpoint : ApiEndpoint.Prod;

    const res = await fetch(baseUrl + route, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'nadeo_v1 t=' + accessToken,
      },
    });

    if (res.status !== 200) {
      throw new Error(await res.text());
    }

    return await res.json() as T;
  }
  async zones() {
    return new Zones(await this.get('/zones'));
  }
  async season(id: string) {
    return await this.get<Season>('/seasons/' + id);
  }
  async maps(ids: string[]) {
    if (ids.length === 0) {
      return [];
    }
    const idType = ids.at(0)!.length === 36 ? 'Id' : 'Uid';
    return await this.get<any[]>(`/maps?map${idType}List=` + ids.join(','));
  }
  async campaigns(campaign: CampaignType, offset?: number, length?: number) {
    const api = ['/campaign/' + campaign];
    const parameters = [`offset=${offset ?? 0}`, `length=${length ?? 1}`];

    if (parameters.length > 0) {
      api.push(parameters.join('&'));
    }

    return await this.get<Campaigns>(api.join('?'), true);
  }
  async leaderboard(groupOrSeasonId: string, mapId: string | undefined, offset: number, length: number) {
    return await this.get<LeaderboardResponse>(
      `/leaderboard/group/${groupOrSeasonId}${mapId ? `/map/${mapId}` : ''}/top` +
        `?offset=${offset}&length=${length}&onlyWorld=1`,
      true,
    );
  }
  async mapRecords(accountIdList: string[], mapIdList: string[]) {
    return await this.get<MapRecord[]>(
      `/mapRecords?accountIdList=${accountIdList.join(',')}&mapIdList=${mapIdList.join(',')}`,
    );
  }
  async competitions(competitionId: string) {
    return await this.get(`/competitions/${competitionId}`, true, ApiEndpoint.Competition);
  }
  async competitionsRounds(competitionId: string) {
    return await this.get(`/competitions/${competitionId}/rounds`, true, ApiEndpoint.Competition);
  }
  async rounds(roundId: string) {
    return await this.get(`/rounds/${roundId}/matches`, true, ApiEndpoint.Competition);
  }
  async matches(matchId: string) {
    return await this.get(`/matches/${matchId}/results`, true, ApiEndpoint.Competition);
  }
  async challenges(challengeId: string) {
    return await this.get(`/challenges/${challengeId}`, true, ApiEndpoint.Competition);
  }
  async challengesLeaderboard(matchId: string) {
    return await this.get(`/challenges/${matchId}/leaderboard`, true, ApiEndpoint.Competition);
  }
  async downloadFile(url: string) {
    const res = await fetch(url, {});

    if (res.status !== 200) {
      throw new Error(await res.text());
    }

    return await res.arrayBuffer();
  }
  async clubActivity(clubId: string, offset = 0, length = 10, active = true) {
    return await this.get<ClubActivityResponse>(
      `/club/${clubId}/activity?offset=${offset}&length=${length}&active=${active ? 1 : 0}`,
      true,
    );
  }
  async clubCampaign(clubId: string, campaignId: string) {
    return await this.get<ClubCampaignResponse>(`/club/${clubId}/campaign/${campaignId}`, true);
  }
}

export enum ZoneType {
  World = 0,
  Continent = 1,
  Country = 2,
  Region = 3,
}

export interface Zone {
  zoneId: string;
  parentId: string | null;
  name: string;
}

export class Zones {
  cache = new Map<string, Zone[]>();
  cachePaths = new Map<string, Zone[]>();

  constructor(public data: Zone[]) {
  }
  *[Symbol.iterator]() {
    for (const zone of this.data) {
      yield zone;
    }
  }
  search(zoneId: string): Zone[] {
    const cachedZone = this.cache.get(zoneId);
    if (cachedZone) {
      return cachedZone;
    }

    const zones = this.searchUncached(zoneId);
    this.cache.set(zoneId, zones);
    return zones;
  }
  searchUncached(zoneId: string): Zone[] {
    const zones: Zone[] = [];

    for (const zone of this.data) {
      if (zone.zoneId === zoneId) {
        if (zone.parentId !== null) {
          zones.push(...this.searchUncached(zone.parentId));
        }
        zones.push(zone);
      }
    }

    return zones;
  }
  searchByNamePath(zonePath: string) {
    const cachedZone = this.cachePaths.get(zonePath);
    if (cachedZone) {
      return cachedZone;
    }

    const zones: Zone[] = [];
    const zoneNames = zonePath.split('|');

    let lastParentId = null;

    for (const zoneName of zoneNames) {
      for (const zone of this.data) {
        if (zone.name === zoneName && lastParentId === zone.parentId) {
          zones.push(zone);
          lastParentId = zone.zoneId;
        }
      }
    }

    if (zonePath.length === 0) {
      console.warn('Zone by path not found:', zonePath);
    }

    this.cachePaths.set(zonePath, zones);

    return zones;
  }
}

export interface Season {
  seasonMapList: any;
}

export enum CampaignType {
  Official = 'official',
  TrackOfTheDay = 'month',
}

export interface Campaigns {
  monthList: any;
  campaignList: any;
}

export interface LeaderboardResponse {
  groupUid: string;
  mapUid: string;
  tops: {
    zoneId: string;
    zoneName: string;
    top: {
      accountId: string;
      zoneId: string;
      zoneName: string;
      position: number;
      score: number;
      sp: number; // TODO: undefined when mapId given
    }[];
  }[];
}

export interface MapRecord {
  accountId: string;
  filename: string;
  gameMode: string;
  gameModeCustomData: string;
  mapId: string;
  medal: string;
  recordScore: { respawnCount: string; score: string; time: string };
  removed: string;
  scopeId: string;
  scopeType: string;
  timestamp: string;
  url: string;
  respawnCount: string;
  score: string;
  time: string;
}

export interface CompetitionRound {
  qualifier_challenge_id: string;
  training_challenge_id: string;
  id: string;
  position: number;
  name: string;
  start_date: number;
  end_date: number;
  lock_date: string;
  status: string;
  is_locked: boolean;
  auto_needs_matches: boolean;
  match_score_direction: string;
  leaderboard_compute_type: string;
  team_leaderboard_compute_type: string;
  deleted_on: string;
  nb_matches: number;
}

export interface RoundMatch {
}

export interface Match {
}

export interface LeaderboardChallenge {
}

export interface Competitions {
}

export type CompetitionsRounds = CompetitionRound[];

export interface Rounds {
  matches: RoundMatch[];
}

export type Matches = Match[];

export interface Challenges {
}

export type ChallengesLeaderboard = LeaderboardChallenge[];

export type ClubActivity = {
  campaignId: string;
  name: string;
  activityType: 'campaign';
};

export type ClubActivityResponse = {
  activityList: ClubActivity[];
};

export type ClubCampaignResponse = {
  clubDecalUr: string;
  campaignId: number;
  activityId: number;
  mediaUr: string;
  mediaTheme: string;
  campaign: {
    id: number;
    seasonUid: string;
    name: string;
    color: string;
    useCase: number;
    clubId: number;
    leaderboardGroupUid: string;
    publicationTimestamp: number;
    startTimestamp: number;
    endTimestamp: number;
    rankingSentTimestamp: null;
    year: number;
    week: number;
    day: number;
    monthYear: number;
    month: number;
    monthDay: number;
    published: boolean;
    playlist: {
      id: number;
      position: number;
      mapUid: string;
    }[];
    latestSeasons: {
      uid: string;
      name: string;
      startTimestamp: number;
      endTimestamp: number;
      relativeStart: number;
      relativeEnd: number;
      campaignId: number;
      active: boolean;
    }[];
    categories: { position: number; length: number; name: string }[];
    media: {
      buttonBackgroundUr: string;
      buttonForegroundUr: string;
      decalUr: string;
      popUpBackgroundUr: string;
      popUpImageUr: string;
      liveButtonBackgroundUr: string;
      liveButtonForegroundUr: string;
    };
    editionTimestamp: number;
  };
  popularityLevel: number;
  publicationTimestamp: number;
  creationTimestamp: number;
  creatorAccountId: string;
  latestEditorAccountId: string;
  id: number;
  clubId: number;
  clubName: string;
  name: string;
  mapsCount: number;
};

export class TrackmaniaOAuthClient {
  #id: string;
  #secret: string;
  #loginData: any | null;

  constructor(options: { id: string; secret: string }) {
    this.#id = options.id;
    this.#secret = options.secret;
    this.#loginData = null;
  }
  async login() {
    const url = `https://api.trackmania.com/api/access_token`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `grant_type=client_credentials&client_id=${this.#id}&client_secret=${this.#secret}`,
    });

    if (res.status !== 200) {
      throw new Error(await res.text());
    }

    this.#loginData = await res.json();

    return this;
  }
  async displayNames(ids: string[]): Promise<Record<string, string>> {
    if (this.#loginData == null) {
      await this.login();
    }

    const url = `https://api.trackmania.com/api/display-names?accountId[]=${ids.join('&accountId[]=')}`;

    const fetchDisplayNames = async () => {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.#loginData.access_token}`,
        },
      });

      return res;
    };

    let res = await fetchDisplayNames();

    if (res.status !== 200) {
      if (res.status === 401) {
        this.login();

        res = await fetchDisplayNames();
        if (res.status !== 200) {
          throw new Error(`Fetch display names after reauth failed : ${res.status} : ${await res.text()}`);
        }
      } else {
        throw new Error(`Fetch display names failed : ${res.status} :${await res.text()}`);
      }
    }

    const json = await res.json();

    // WTF!? Why are they returning an empty array instead of an empty object??
    return Array.isArray(json) ? Object.create(null) : json;
  }
}
