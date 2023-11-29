// Copyright (c) 2023, NeKz
// SPDX-License-Identifier: MIT

import { logger } from '../utils/logger.ts';
import { Webhooks } from './webhooks.ts';

const SERVICE_DATA_UPDATE_INTERVAL = 15 * 60 * 1_000;

const log = logger({ name: 'Services' });

export const services = {
  'Webhooks': () => Webhooks.load.bind(Webhooks),
};

export const loadAllServices = async () => {
  log.info(`Loading all services`);

  await Webhooks.load();

  log.info(`Loaded all services`);

  setInterval(async () => {
    log.info(`Reloading all services`);

    try {
      const toReload = Object.entries(services);
      const results = await reloadAllServices();

      log.info(
        `Reloaded all services\n` + results.map((result, index) => {
          return `${toReload[index]!.at(0)}: ${result ? 'success' : 'failed'}`;
        }).join(' | '),
      );

      log.info(`Reloaded all services`);
    } catch (err) {
      log.error(err);
      log.warn(`Failed to reload all services`);
    }
  }, SERVICE_DATA_UPDATE_INTERVAL);

  log.info(`Loaded services and started update interval.`);
};

export const getService = (service: string) => {
  return services[service as keyof typeof services];
};

const tryReload = (reloadFunc: () => Promise<void>) => async () => {
  try {
    await reloadFunc();
    return true;
  } catch (err) {
    log.error(err);
  }
  return false;
};

export const reloadService = async (
  toReload: ReturnType<typeof getService>,
) => {
  return await tryReload(toReload())();
};

export const reloadAllServices = async () => {
  const toReload = Object.entries(services);
  return await Promise.all(
    toReload.map(([_, func]) => tryReload(func())()),
  );
};
