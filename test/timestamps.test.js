import test from 'node:test';
import assert from 'node:assert/strict';
import { formatManilaTimestamp, getManilaTimestamp } from '../timestamps.js';

test('Manila timestamps are stored to the minute without a timezone suffix', () => {
  assert.equal(
    getManilaTimestamp(new Date('2026-11-16T04:03:59.999Z')),
    '2026-11-16T12:03',
  );
});

test('Manila timestamp display preserves local timestamps and converts legacy UTC values', () => {
  assert.equal(formatManilaTimestamp('2026-11-16T12:03'), '2026-11-16 12:03');
  assert.equal(
    formatManilaTimestamp('2026-11-16T01:27:56.757Z'),
    '2026-11-16 09:27',
  );
});
