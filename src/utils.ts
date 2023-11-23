// Copyright (c) 2023, NeKz
// SPDX-License-Identifier: MIT

import * as flags from 'country-flag-emoji';
import { TrackRecord } from './models.ts';
import { ZoneType } from './api.ts';

export const formatScore = (score: number | undefined | null) => {
  if (score === undefined || score === null) {
    return '';
  }

  const msec = score % 1000;
  const tsec = Math.floor(score / 1000);
  const sec = tsec % 60;
  const min = Math.floor(tsec / 60);

  return (
    (min > 0 ? min + ':' : '') +
    (sec < 10 && min > 0 ? '0' + sec : sec) +
    '.' +
    (msec < 100 ? (msec < 10 ? '00' + msec : '0' + msec) : msec)
  );
};

const specialMdCharacters = [
  '[',
  ']',
  '(',
  ')',
  '`',
  '*',
  '_',
  '~',
];

export const escapeMarkdown = (text: string) => {
  return specialMdCharacters.reduce(
    (title, char) => title.replaceAll(char, `\\${char}`),
    text,
  );
};

export const getEmojiFlag = (user: TrackRecord['user']) => {
  const country = user.zone[ZoneType.Country] ? user.zone[ZoneType.Country].name : null;
  const flag = country ? flags.list.find((flag: { name: string }) => flag.name === country) : null;
  return flag ? ' ' + flag.emoji : '';
};
