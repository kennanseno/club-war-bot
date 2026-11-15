import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMemberTableMessages } from '../member-table.js';

test('member lists are numbered in order and formatted into four-column tables', () => {
  const [message] = formatMemberTableMessages(
    'Attendance for 2026-11-16 (5 members):',
    ['Alex', 'Jamie (added by admin)', 'Sam', 'Taylor', 'Uma'],
    'No attendance recorded.',
  );

  assert.match(message, /\|  \|  \|  \|  \|/);
  assert.match(message, /\| 1\. Alex \| 2\. Jamie \(added by admin\) \| 3\. Sam \| 4\. Taylor \|/);
  assert.match(message, /\| 5\. Uma \|  \|  \|  \|/);
});

test('member table escapes names and removes line breaks', () => {
  const [message] = formatMemberTableMessages(
    'Late notices for 2026-11-16 (2 members):',
    ['A|B', 'Name\nNext'],
    'No late notices.',
  );

  assert.match(message, /A\\\|B/);
  assert.match(message, /Name Next/);
  assert.doesNotMatch(message, /Name\nNext/);
});

test('long member tables split below Discord message limits and repeat headings', () => {
  const members = Array.from({ length: 150 }, (_, index) => `Member ${index} ${'x'.repeat(32)}`);
  const messages = formatMemberTableMessages(
    'Late notices for 2026-11-16 (150 members):',
    members,
    'No late notices.',
  );

  assert.ok(messages.length > 1);
  for (const message of messages) {
    assert.ok(message.length <= 1800);
    assert.match(message, /\|  \|  \|  \|  \|/);
    assert.match(message, /\d+\. Member/);
  }
  for (const member of members) assert.ok(messages.some((message) => message.includes(member)));
});

test('empty member lists show the supplied empty-state message', () => {
  assert.deepEqual(
    formatMemberTableMessages(
      'Attendance for 2026-11-16 (0 members):',
      [],
      'No attendance recorded.',
    ),
    ['Attendance for 2026-11-16 (0 members):\nNo attendance recorded.'],
  );
});
