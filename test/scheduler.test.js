import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatAttendanceListMessages,
  formatLateListMessages,
} from '../attendance-lists.js';
import { formatAttendanceRosterMessages } from '../scheduler.js';

test('attendance roster is a single-column list ordered by earliest recorded time', () => {
  const [message] = formatAttendanceRosterMessages(
    '2026-11-16',
    ['Uma', 'Taylor', 'Sam', 'Jamie', 'Alex'].map((displayName, index) => ({
      displayName,
      recordedAt: `2026-11-16T19:${String(49 - index).padStart(2, '0')}`,
    })),
  );

  assert.match(message, /^Attendance for 11-16-2026:/);
  assert.match(message, /\| 1\. Alex \(recorded 11-16-2026 19:45\)\s+\|/);
  assert.match(message, /\| 2\. Jamie \(recorded 11-16-2026 19:46\)\s+\|/);
  assert.match(message, /\| 5\. Uma \(recorded 11-16-2026 19:49\)\s+\|/);
  assert.doesNotMatch(message, /\| # \| Member \|/);
});

test('attendance roster escapes table separators, backticks, and line breaks in names', () => {
  const [message] = formatAttendanceRosterMessages('2026-11-16', [
    { displayName: 'A|B', recordedAt: '2026-11-16T19:45' },
    { displayName: 'Name\nNext', recordedAt: '2026-11-16T19:45' },
    { displayName: '`Quoted`', recordedAt: '2026-11-16T19:45' },
  ]);

  assert.match(message, /A\\\|B/);
  assert.match(message, /Name Next/);
  assert.doesNotMatch(message, /Name\nNext/);
  assert.match(message, /'Quoted'/);
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
    assert.match(message, /```[\s\S]*```/);
    assert.match(message, /\|\s+\d+\. Member/);
  }
  for (const record of records) {
    assert.ok(messages.some((message) => message.includes(record.displayName)));
  }
});

test('empty attendance roster has a clear empty state', () => {
  assert.deepEqual(formatAttendanceRosterMessages('2026-11-16', []), [
    'Attendance for 11-16-2026:\nNo attendance recorded for this session.',
  ]);
});

test('attendance roster supports a custom title for an in-progress snapshot', () => {
  const [message] = formatAttendanceRosterMessages(
    '2026-11-16',
    [{ displayName: 'Alex', recordedAt: '2026-11-16T20:45' }],
    'Attendance recorded so far for 11-16-2026:',
  );

  assert.match(message, /^Attendance recorded so far for 11-16-2026:/);
  assert.match(message, /\| 1\. Alex \(recorded 11-16-2026 20:45\)\s+\|/);
});

test('scheduled attendance uses the same table format as the admin attendance list', () => {
  const records = [
    { displayName: 'Alex', recordedAt: '2026-11-16T19:45' },
    { displayName: 'Jamie', recordedAt: '2026-11-16T19:50' },
  ];
  const [adminMessage] = formatAttendanceListMessages('2026-11-16', records);
  const [scheduledMessage] = formatAttendanceRosterMessages(
    '2026-11-16',
    records,
    'Final attendance for 11-16-2026:',
  );
  const adminTable = adminMessage.slice(adminMessage.indexOf('```'));
  const scheduledTable = scheduledMessage.slice(scheduledMessage.indexOf('```'));

  assert.equal(scheduledTable, adminTable);
  assert.match(scheduledMessage, /^Final attendance for 11-16-2026:/);
});

test('7:40 late roster uses the timestamp-ordered late list table', () => {
  const [message] = formatLateListMessages(
    '2026-11-16',
    [
      { displayName: 'Later', recordedAt: '2026-11-16T19:35' },
      { displayName: 'Earlier', recordedAt: '2026-11-16T19:31' },
    ],
    'Members who reported late for 11-16-2026:',
  );

  assert.match(message, /^Members who reported late for 11-16-2026:/);
  assert.match(message, /\n```\n\+[-+]+\+/);
  assert.ok(message.indexOf('Earlier (reported') < message.indexOf('Later (reported'));
  assert.match(message, /\| 1\. Earlier \(reported 11-16-2026 19:31\)/);
  assert.match(message, /\n\| [^|\n]+ \|\n\+[-+]+\+/);
  assert.doesNotMatch(message, /\| # \| Member \|/);
});
