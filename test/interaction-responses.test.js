import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deferInteractionResponse,
  editDeferredInteractionResponse,
} from '../interaction-responses.js';

test('deferred interaction response acknowledges immediately and preserves flags', () => {
  let response;
  const res = {
    locals: {},
    send(value) {
      response = value;
      return value;
    },
  };

  deferInteractionResponse(res, 64);

  assert.equal(response.type, 5);
  assert.deepEqual(response.data, { flags: 64 });
  assert.equal(res.locals.interactionDeferred, true);
});

test('deferred response editor updates the original interaction response', async () => {
  const requests = [];
  await editDeferredInteractionResponse(
    'application',
    'interaction-token',
    'Attendance recorded.',
    async (...args) => requests.push(args),
  );

  assert.deepEqual(requests, [[
    'webhooks/application/interaction-token/messages/@original',
    {
      method: 'PATCH',
      body: {
        content: 'Attendance recorded.',
        allowed_mentions: { parse: [] },
      },
    },
  ]]);
});
