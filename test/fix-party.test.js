import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIX_PARTY_CLASSES,
  FIX_PARTY_MAX_SIZE,
  FIX_PARTY_TYPES,
  formatFixPartyList,
  getUserParty,
  splitDiscordMessages,
  validateFixPartyAdd,
} from '../fix-party.js';
import { FIX_PARTY_COMMAND, FIX_PARTY_INFO_MESSAGE } from '../fix-party-command.js';
import { getWarInfoMessage } from '../config.js';

const party = {
  id: 'party-1',
  name: 'Raid Squad',
  leaderRoleId: 'leader-role',
  memberRoleId: 'member-role',
  leader: {
    userId: 'leader',
    displayName: 'Leader',
    joinedAt: '2026-01-01T00:00:00.000Z',
  },
  members: [],
};

test('fix-party command registers all subcommands and required add choices', () => {
  assert.deepEqual(
    FIX_PARTY_COMMAND.options.map((option) => option.name),
    ['info', 'list', 'create', 'add', 'remove', 'leave', 'disband'],
  );
  const add = FIX_PARTY_COMMAND.options.find((option) => option.name === 'add');
  const create = FIX_PARTY_COMMAND.options.find((option) => option.name === 'create');
  assert.equal(create.options.find((option) => option.name === 'name').required, false);
  assert.equal(add.options.find((option) => option.name === 'name').type, 6);
  assert.deepEqual(
    add.options.find((option) => option.name === 'class').choices.map(({ value }) => value),
    FIX_PARTY_CLASSES,
  );
  assert.deepEqual(
    add.options.find((option) => option.name === 'type').choices.map(({ value }) => value),
    FIX_PARTY_TYPES,
  );
  assert.match(FIX_PARTY_INFO_MESSAGE, /`\/fix-party info`/);
  assert.match(getWarInfoMessage(), /`\/fix-party info`/);
});

test('add validates leader, selected user, class/type, uniqueness, and seven-member maximum', () => {
  const parties = [party];
  assert.match(
    validateFixPartyAdd({
      parties,
      party,
      actorId: 'not-leader',
      user: { id: 'member' },
      className: 'Archer',
      type: 'Dex',
    }),
    /leader/,
  );
  assert.match(
    validateFixPartyAdd({
      parties,
      party,
      actorId: 'leader',
      user: { id: 'bot', bot: true },
      className: 'Archer',
      type: 'Dex',
    }),
    /Bot accounts/,
  );
  assert.match(
    validateFixPartyAdd({
      parties,
      party,
      actorId: 'leader',
      user: { id: 'member' },
      className: 'Knight',
      type: 'Dex',
    }),
    /valid class/,
  );
  assert.match(
    validateFixPartyAdd({
      parties,
      party,
      actorId: 'leader',
      user: { id: 'member' },
      className: 'Archer',
      type: 'Vit',
    }),
    /valid type/,
  );

  const fullParty = {
    ...party,
    members: Array.from({ length: FIX_PARTY_MAX_SIZE - 1 }, (_, index) => ({
      userId: `member-${index}`,
      displayName: `Member ${index}`,
      joinedAt: `2026-01-0${index + 2}T00:00:00.000Z`,
      className: 'Archer',
      type: 'Dex',
    })),
  };
  assert.match(
    validateFixPartyAdd({
      parties: [fullParty],
      party: fullParty,
      actorId: 'leader',
      user: { id: 'another-member' },
      className: 'Archer',
      type: 'Dex',
    }),
    /full.*8 people.*7 members/,
  );
  assert.equal(fullParty.members.length, 7);
});

test('a user already listed in any party cannot be added again', () => {
  const otherParty = {
    ...party,
    id: 'party-2',
    leader: { ...party.leader, userId: 'other-leader' },
    members: [{
      userId: 'existing-member',
      displayName: 'Existing Member',
      joinedAt: '2026-01-02T00:00:00.000Z',
      className: 'Shaman',
      type: 'Int',
    }],
  };
  assert.equal(getUserParty([party, otherParty], 'existing-member'), otherParty);
  assert.match(
    validateFixPartyAdd({
      parties: [party, otherParty],
      party,
      actorId: 'leader',
      user: { id: 'existing-member' },
      className: 'Archer',
      type: 'Dex',
    }),
    /already belongs/,
  );
});

test('party list orders leader first and fills all eight slots', () => {
  const listedParty = {
    ...party,
    members: [
      {
        userId: 'newer',
        displayName: 'Newer',
        joinedAt: '2026-01-03T00:00:00.000Z',
        className: 'Brawler',
        type: 'Pow',
      },
      {
        userId: 'older',
        displayName: 'Older',
        joinedAt: '2026-01-02T00:00:00.000Z',
        className: 'Archer',
        type: 'Dex',
      },
    ],
  };
  const [message] = formatFixPartyList([listedParty]);
  assert.match(message, /1\. Party Leader — <@leader>/);
  assert.ok(message.indexOf('<@older>') < message.indexOf('<@newer>'));
  assert.match(message, /Archer \/ Dex/);
  assert.equal((message.match(/Empty slot/g) ?? []).length, 5);
  assert.equal(message.split('\n').length, FIX_PARTY_MAX_SIZE + 1);
});

test('party output is split into messages below Discord limit', () => {
  const messages = splitDiscordMessages(['a'.repeat(1500), 'b'.repeat(800)]);
  assert.equal(messages.length, 2);
  assert.ok(messages.every((message) => message.length <= 1900));
});
