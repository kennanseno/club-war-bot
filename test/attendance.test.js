import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addAttendanceManually,
  recordAttendance,
  recordLateReport,
} from '../attendance.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../store.js';

test('self check-ins and admin additions are unique per member and session', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'club-war-attendance-'));
  try {
    const store = createStore(join(directory, 'data.json'));
    const record = {
      guildId: 'guild',
      sessionDate: '2026-11-16',
      userId: 'member',
      displayName: 'Member',
    };

    assert.equal(await recordAttendance(store.update, record), 'recorded');
    assert.equal(await recordAttendance(store.update, record), 'duplicate');
    assert.equal(
      await addAttendanceManually(store.update, { ...record, addedBy: 'admin' }),
      'duplicate',
    );

    const persisted = await store.read();
    assert.equal(persisted.attendance.length, 1);
    assert.equal(persisted.attendance[0].source, 'self');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('admin attendance entries retain the administrator audit identity', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'club-war-admin-attendance-'));
  try {
    const store = createStore(join(directory, 'data.json'));
    const result = await addAttendanceManually(store.update, {
      guildId: 'guild',
      sessionDate: '2026-11-16',
      userId: 'member',
      displayName: 'Member',
      addedBy: 'admin',
    });

    assert.equal(result, 'added');
    const [record] = (await store.read()).attendance;
    assert.equal(record.source, 'admin');
    assert.equal(record.addedBy, 'admin');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('late reports are unique per member, guild, and war date', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'club-war-late-report-'));
  try {
    const store = createStore(join(directory, 'data.json'));
    const report = {
      guildId: 'guild',
      sessionDate: '2026-11-16',
      userId: 'member',
      displayName: 'Member',
    };

    assert.equal(await recordLateReport(store.update, report), 'recorded');
    assert.equal(await recordLateReport(store.update, report), 'duplicate');
    assert.equal(
      await recordLateReport(store.update, { ...report, sessionDate: '2026-11-18' }),
      'recorded',
    );
    assert.equal(
      await recordLateReport(store.update, { ...report, guildId: 'another-guild' }),
      'recorded',
    );

    const persisted = await store.read();
    assert.equal(persisted.lateReports.length, 3);
    assert.equal(persisted.lateReports[0].displayName, 'Member');
    assert.ok(persisted.lateReports[0].recordedAt);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
