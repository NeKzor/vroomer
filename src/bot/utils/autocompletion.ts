// Copyright (c) 2023, NeKz
// SPDX-License-Identifier: MIT

const defaultSplitCharacter = ' ';
const defaultMaxItems = 5;

export const createAutocompletion = <T, C = undefined>(
  options: {
    items: (context?: C) => T[];
    idKey: Extract<keyof T, string | number>;
    nameKey: Extract<keyof T, string>;
    maxItems?: number;
    splitCharacter?: string;
    additionalCheck?: (item: T, query: string) => boolean;
    customQuery?: (name: string, query: string) => boolean;
  },
) => {
  const { items, idKey, nameKey, additionalCheck } = options;

  const splitCharacter = options.splitCharacter ?? defaultSplitCharacter;
  const maxItems = options.maxItems ?? defaultMaxItems;
  const customQuery = options.customQuery;

  return (
    { query, isAutocomplete, context }: { query: string; isAutocomplete: boolean; context?: C },
  ) => {
    const list = items(context);

    if (query.length === 0) {
      return list.slice(0, maxItems);
    }

    const exactMatch = list
      .find((item) => (item[nameKey] as string).toLowerCase() === query);

    if (exactMatch) {
      return [exactMatch];
    }

    const results = [];

    for (const item of list) {
      if (
        !isAutocomplete && (item[idKey] as string | number).toString() === query
      ) {
        return [item];
      }

      const name = (item[nameKey] as string).toLowerCase();

      if (customQuery) {
        if (customQuery(name, query)) {
          results.push(item);
        }
      } else if (
        name.startsWith(query) ||
        name.split(splitCharacter).includes(query) ||
        (additionalCheck && additionalCheck(item, query))
      ) {
        results.push(item);
      }

      if (results.length === maxItems) {
        break;
      }
    }

    return results;
  };
};
