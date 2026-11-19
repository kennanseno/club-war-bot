import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../store.js';

async function withTempStore(run) {
  const directory = await mkdtemp(join(tmpdir(), 'club-war-store-'));
  try {
    await run(createStore(join(directory, 'data.json')), directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('store persists updates and serializes concurrent writes', async () => {
  await withTempStore(async (store, directory) => {
    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        store.update((data) => {
          data.attendance.push({
            guildId: 'guild',
            sessionDate: '2026-11-16',
            userId: String(index),
            displayName: `Member ${index}`,
          });
        }),
      ),
    );

    const data = await store.read();
    assert.equal(data.attendance.length, 10);
    const onDisk = JSON.parse(await readFile(join(directory, 'data.json'), 'utf8'));
    assert.equal(onDisk.attendance.length, 10);
  });
});

test('store reports corrupted JSON rather than resetting it', async () => {
  await withTempStore(async (store, directory) => {
    const filePath = join(directory, 'data.json');
    await writeFile(filePath, '{invalid json', 'utf8');

    await assert.rejects(store.read(), /Unable to parse bot data file/);
    await assert.rejects(store.update(() => {}), /Unable to parse bot data file/);
    assert.equal(await readFile(filePath, 'utf8'), '{invalid json');
  });
});

test('store rejects a structurally invalid data file', async () => {
  await withTempStore(async (store, directory) => {
    await writeFile(
      join(directory, 'data.json'),
      JSON.stringify({ version: 1, guilds: {}, attendance: {} }),
      'utf8',
    );
    await assert.rejects(store.read(), /Invalid data structure/);
  });
});

test('store loads existing data without late reports as an empty late-report list', async () => {
  await withTempStore(async (store, directory) => {
    const legacyData = {
      version: 1,
      guilds: {},
      attendance: [],
      announcements: [],
    };
    await writeFile(join(directory, 'data.json'), JSON.stringify(legacyData), 'utf8');

    assert.deepEqual((await store.read()).lateReports, []);
  });
});

test('store loads existing data without fixed parties as an empty party collection', async () => {
  await withTempStore(async (store, directory) => {
    const legacyData = {
      version: 1,
      guilds: {},
      attendance: [],
      announcements: [],
    };
    await writeFile(join(directory, 'data.json'), JSON.stringify(legacyData), 'utf8');

    assert.deepEqual((await store.read()).fixParties, {});
  });
});

test('store accepts up to seven party members and rejects an eighth non-leader member', async () => {
  await withTempStore(async (store) => {
    const createParty = (memberCount) => ({
      version: 1,
      guilds: {},
      fixParties: {
        guild: [{
          id: 'party',
          name: 'Raid Squad',
          leaderRoleId: 'leader-role',
          memberRoleId: 'member-role',
          leader: {
            userId: 'leader',
            displayName: 'Leader',
            joinedAt: '2026-01-01T00:00:00.000Z',
          },
          members: Array.from({ length: memberCount }, (_, index) => ({
            userId: `member-${index}`,
            displayName: `Member ${index}`,
            joinedAt: `2026-01-0${index + 2}T00:00:00.000Z`,
            className: 'Archer',
            type: 'Dex',
          })),
        }],
      },
      attendance: [],
      announcements: [],
    });

    await store.update((data) => Object.assign(data, createParty(7)));
    assert.equal((await store.read()).fixParties.guild[0].members.length, 7);
    await assert.rejects(
      store.update((data) => Object.assign(data, createParty(8))),
      /Invalid fixed-party records/,
    );
  });
});
