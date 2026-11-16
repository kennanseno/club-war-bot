import test from 'node:test';
import assert from 'node:assert/strict';
import { formatAttendanceRosterMessages } from '../scheduler.js';

test('attendance roster is ordered with one member per row', () => {
  const [message] = formatAttendanceRosterMessages(
    '2026-11-16',
    ['Alex', 'Jamie', 'Sam', 'Taylor', 'Uma'].map((displayName) => ({
      displayName,
      recordedAt: '2026-11-16T19:45',
    })),
  );

  assert.match(message, /\| # \| Member \|/);
  assert.match(message, /^Attendance for 11-16-2026:/);
  assert.match(message, /\| 1 \| Alex \(recorded 11-16-2026 19:45\) \|/);
  assert.match(message, /\| 2 \| Jamie \(recorded 11-16-2026 19:45\) \|/);
  assert.match(message, /\| 5 \| Uma \(recorded 11-16-2026 19:45\) \|/);
});

test('attendance roster escapes table separators and line breaks in names', () => {
  const [message] = formatAttendanceRosterMessages('2026-11-16', [
    { displayName: 'A|B', recordedAt: '2026-11-16T19:45' },
    { displayName: 'Name\nNext', recordedAt: '2026-11-16T19:45' },
  ]);

  assert.match(message, /A\\\|B/);
  assert.match(message, /Name Next/);
  assert.doesNotMatch(message, /Name\nNext/);
});

test('long attendance rosters are split into messages with repeated table headers', () => {
  const records = Array.from({ length: 150 }, (_, index) => ({
    displayName: `Member ${index} ${'x'.repeat(32)}`,
    recordedAt: '2026-11-16T19:45',
  }));
  const messages = formatAttendanceRosterMessages('2026-11-16', records);

  assert.ok(messages.length > 1);
  for (const message of messages) {
    assert.ok(message.length <= 1800);
    assert.match(message, /\| # \| Member \|/);
  }
  for (const record of records) {
    assert.ok(messages.some((message) => message.includes(record.displayName)));
  }
});

test('empty attendance roster has a clear empty state', () => {
  assert.deepEqual(formatAttendanceRosterMessages('2026-11-16', []), [
    'Attendance for 11-16-2026:\n| # | Member |\n|---:|---|\n| - | No attendance recorded for this session. |',
  ]);
});

test('attendance roster supports a custom title for an in-progress snapshot', () => {
  const [message] = formatAttendanceRosterMessages(
    '2026-11-16',
    [{ displayName: 'Alex', recordedAt: '2026-11-16T20:45' }],
    'Attendance recorded so far for 11-16-2026:',
  );

  assert.match(message, /^Attendance recorded so far for 11-16-2026:/);
  assert.match(message, /\| 1 \| Alex \(recorded 11-16-2026 20:45\) \|/);
});
