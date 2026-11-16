import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatAttendanceListMessages,
  formatLateListMessages,
} from '../attendance-lists.js';

test('attendance response list includes the current session members and recorded times', () => {
  const [message] = formatAttendanceListMessages('2026-11-16', [
    {
      displayName: 'Later',
      source: 'self',
      recordedAt: '2026-11-16T19:50',
    },
    {
      displayName: 'Earlier',
      source: 'admin',
      recordedAt: '2026-11-16T19:45',
    },
  ]);

  assert.match(message, /^Attendance for 11-16-2026 \(2 members\):/);
  assert.ok(message.indexOf('Earlier (added by admin)') < message.indexOf('Later'));
  assert.match(message, /Earlier \(added by admin\) \(recorded 11-16-2026 19:45\)/);
  assert.match(message, /Later \(recorded 11-16-2026 19:50\)/);
});

test('late response list includes current notices for the selected date and report times', () => {
  const [message] = formatLateListMessages('2026-11-18', [
    {
      displayName: 'Later',
      recordedAt: '2026-11-16T20:30',
    },
    {
      displayName: 'Earlier',
      recordedAt: '2026-11-16T20:12',
    },
  ]);

  assert.match(message, /^Late notices for 11-18-2026 \(2 members\):/);
  assert.ok(message.indexOf('Earlier (reported') < message.indexOf('Later (reported'));
  assert.match(message, /Earlier \(reported 11-16-2026 20:12\)/);
});

test('attendance and late response lists explain when there are no records', () => {
  assert.match(
    formatAttendanceListMessages('2026-11-16', [])[0],
    /No attendance recorded\./,
  );
  assert.match(
    formatLateListMessages('2026-11-16', [])[0],
    /No members have reported that they will be late/,
  );
});
