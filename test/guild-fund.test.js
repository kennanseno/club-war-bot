import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  formatGuildFundInfoMessage,
  formatGuildFundMessage,
  getGuildFundAnnouncement,
  migrateLegacyGuildFunds,
  updateGuildFund,
} from '../guild-fund.js';
import { createStore } from '../store.js';
import { createGuildFundStore } from '../guild-fund-store.js';

test('guild fund display shows configured values and unset values', () => {
  assert.equal(
    formatGuildFundMessage({
      ep: '12,500 E-Points',
      gold: '3.2M',
      php: '₱4,250',
    }),
    '**Guild Fund**\n**EP (E-Points):** 12,500 E-Points\n**Gold:** 3.2M\n**PHP (Cash):** ₱4,250',
  );
  assert.equal(
    formatGuildFundMessage(),
    '**Guild Fund**\n**EP (E-Points):** Not set\n**Gold:** Not set\n**PHP (Cash):** Not set',
  );
});

test('guild fund info lists public commands and points admins to their guide', () => {
  const message = formatGuildFundInfoMessage();
  assert.match(message, /`\/guild-fund view`.*anyone/);
  assert.match(message, /`\/ran-admin info`/);
  assert.doesNotMatch(message, /\/ran-admin fund/);
});

test('guild fund updates persist per guild and preserve other values', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'club-war-guild-fund-'));
  try {
    const store = createGuildFundStore(join(directory, 'data.json'));

    await updateGuildFund(store.update, 'first', {
      ep: '100',
      gold: '200',
      php: '₱300',
    });
    const result = await updateGuildFund(store.update, 'first', {
      gold: '250',
      channelId: 'fund-announcements',
    });
    assert.deepEqual(result, {
      ep: '100',
      gold: '250',
      php: '₱300',
      channelId: 'fund-announcements',
    });

    const data = await store.read();
    assert.deepEqual(data.guildFunds.first, result);
    await updateGuildFund(store.update, 'second', { ep: 'other guild' });
    assert.deepEqual((await store.read()).guildFunds.second, { ep: 'other guild' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('guild fund announcement explicitly allows only the intended everyone ping', () => {
  assert.deepEqual(
    getGuildFundAnnouncement({ ep: '500 EP', gold: '1,000' }),
    {
      content: '@everyone\n**Guild Fund**\n**EP (E-Points):** 500 EP\n**Gold:** 1,000\n**PHP (Cash):** Not set',
      allowed_mentions: { parse: ['everyone'] },
    },
  );
});

test('gold fund announcements use a catchy gold-specific update', () => {
  assert.deepEqual(
    getGuildFundAnnouncement(
      { ep: '500 EP', gold: '1,000', php: '₱250' },
      'gold',
    ),
    {
      content: '@everyone\n**Gold fund update!**\nThe guild Gold fund just got a fresh update. Here is the latest guild stash:\n\n**Guild Fund**\n**EP (E-Points):** 500 EP\n**Gold:** 1,000\n**PHP (Cash):** ₱250',
      allowed_mentions: { parse: ['everyone'] },
    },
  );
});

test('EP and PHP fund announcements use catchy fund-specific updates', () => {
  assert.match(
    getGuildFundAnnouncement(
      { ep: '500 EP', gold: '1,000', php: '₱250' },
      'ep',
    ).content,
    /^@everyone\n\*\*EP fund update!\*\*\nE-Points just got a fresh boost/,
  );
  assert.match(
    getGuildFundAnnouncement(
      { ep: '500 EP', gold: '1,000', php: '₱250' },
      'php',
    ).content,
    /^@everyone\n\*\*PHP cash fund update!\*\*\nThe guild cash balance just got a fresh update/,
  );
});

test('legacy guild funds migrate to their own store without overwriting newer values', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'club-war-guild-fund-migration-'));
  try {
    const mainStore = createStore(join(directory, 'club-war-data.json'));
    const fundStore = createGuildFundStore(join(directory, 'guild-fund-data.json'));
    await mainStore.update((data) => {
      data.guilds.legacy = {
        channelId: 'reminders',
        adminRoleIds: [],
        guildFund: {
          ep: 'legacy EP',
          gold: 'legacy gold',
          php: 'legacy PHP',
          channelId: 'legacy-channel',
        },
      };
    });
    await fundStore.update((data) => {
      data.guildFunds.legacy = { ep: 'new EP' };
    });

    await migrateLegacyGuildFunds(
      mainStore.read,
      mainStore.update,
      fundStore.update,
    );

    assert.deepEqual((await fundStore.read()).guildFunds.legacy, {
      ep: 'new EP',
      gold: 'legacy gold',
      php: 'legacy PHP',
      channelId: 'legacy-channel',
    });
    assert.equal((await mainStore.read()).guilds.legacy.guildFund, undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
