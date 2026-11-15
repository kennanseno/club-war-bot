import test from 'node:test';
import assert from 'node:assert/strict';
import { formatAttendanceRosterMessages } from '../scheduler.js';

test('attendance roster is ordered and uses four number/name pairs per row', () => {
  const [message] = formatAttendanceRosterMessages(
    '2026-11-16',
    ['Alex', 'Jamie', 'Sam', 'Taylor', 'Uma'].map((displayName) => ({ displayName })),
  );

  assert.match(message, /\| # \| Member \| # \| Member \| # \| Member \| # \| Member \|/);
  assert.match(message, /\| 1 \| Alex \| 2 \| Jamie \| 3 \| Sam \| 4 \| Taylor \|/);
  assert.match(message, /\| 5 \| Uma \|  \|  \|  \|  \|  \|  \|/);
});

test('attendance roster escapes table separators and line breaks in names', () => {
  const [message] = formatAttendanceRosterMessages('2026-11-16', [
    { displayName: 'A|B' },
    { displayName: 'Name\nNext' },
  ]);

  assert.match(message, /A\\\|B/);
  assert.match(message, /Name Next/);
  assert.doesNotMatch(message, /Name\nNext/);
});

test('long attendance rosters are split into messages with repeated table headers', () => {
  const records = Array.from({ length: 150 }, (_, index) => ({
    displayName: `Member ${index} ${'x'.repeat(32)}`,
  }));
  const messages = formatAttendanceRosterMessages('2026-11-16', records);

  assert.ok(messages.length > 1);
  for (const message of messages) {
    assert.ok(message.length <= 1800);
    assert.match(message, /\| # \| Member \| # \| Member \| # \| Member \| # \| Member \|/);
  }
  for (const record of records) {
    assert.ok(messages.some((message) => message.includes(record.displayName)));
  }
});

test('empty attendance roster has a clear empty state', () => {
  assert.deepEqual(formatAttendanceRosterMessages('2026-11-16', []), [
    'Attendance for 2026-11-16:\n| # | Member | # | Member | # | Member | # | Member |\n|---:|---|---:|---|---:|---|---:|---|\n| - | No attendance recorded for this session. |  |  |  |  |  |  |',
  ]);
});
