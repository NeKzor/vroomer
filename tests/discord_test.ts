import { assertEquals } from 'jsr:@std/assert';
import { DiscordWebhook } from '../src/discord.ts';

Deno.test('Extract track names correctly', () => {
  assertEquals(DiscordWebhook.extractTrackName('Spring 2024 - 01'), '01');
  assertEquals(DiscordWebhook.extractTrackName('Spring 2024 - 01 - Reverse'), '01');
  assertEquals(DiscordWebhook.extractTrackName('Fall 2023 - 01 - Checkpointless'), '01');
  assertEquals(DiscordWebhook.extractTrackName('SnowIsBack - Reverse'), 'SnowIsBack');
  assertEquals(DiscordWebhook.extractTrackName('RallyIsBack - Checkpointless'), 'RallyIsBack');
  assertEquals(DiscordWebhook.extractTrackName('AlternatingSomething'), 'AlternatingSomething');
  assertEquals(DiscordWebhook.extractTrackName('Randomized Ice-Skiing'), 'Randomized Ice-Skiing');
  assertEquals(
    DiscordWebhook.extractTrackName('(short version) Red Ice Adventures - Marble'),
    '(short version) Red Ice Adventures - Marble',
  );
});
