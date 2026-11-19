import { FIX_PARTY_CLASSES, FIX_PARTY_TYPES } from './fix-party.js';

const userOption = {
  type: 6,
  name: 'name',
  description: 'Server member to select',
  required: true,
};

export const FIX_PARTY_COMMAND = Object.freeze({
  name: 'fix-party',
  description: 'Create and manage fixed parties',
  type: 1,
  options: [
    { type: 1, name: 'info', description: 'Show all fixed-party commands' },
    { type: 1, name: 'list', description: 'List fixed parties and open slots' },
    {
      type: 1,
      name: 'create',
      description: 'Create your fixed party',
      options: [
        {
          type: 3,
          name: 'name',
          description: 'Party name; defaults to your display name',
          required: false,
          max_length: 80,
        },
      ],
    },
    {
      type: 1,
      name: 'add',
      description: 'Add a member to your fixed party',
      options: [
        userOption,
        {
          type: 3,
          name: 'class',
          description: 'Member class',
          required: true,
          choices: FIX_PARTY_CLASSES.map((value) => ({ name: value, value })),
        },
        {
          type: 3,
          name: 'type',
          description: 'Member type',
          required: true,
          choices: FIX_PARTY_TYPES.map((value) => ({ name: value, value })),
        },
      ],
    },
    {
      type: 1,
      name: 'remove',
      description: 'Remove a member from your fixed party',
      options: [userOption],
    },
    { type: 1, name: 'leave', description: 'Leave your fixed party' },
    { type: 1, name: 'disband', description: 'Disband your fixed party' },
  ],
  integration_types: [0],
  contexts: [0],
});

export const FIX_PARTY_INFO_MESSAGE = [
  '**Fix Party Commands**',
  '`/fix-party info` — show this command guide.',
  '`/fix-party list` — list parties, members, and open slots.',
  '`/fix-party create [name]` — create a party; the name is optional.',
  '`/fix-party add name:@user class:<class> type:<type>` — add a member (leader only).',
  '`/fix-party remove name:@user` — remove a member (leader only).',
  '`/fix-party leave` — leave a party; the oldest member becomes leader if needed.',
  '`/fix-party disband` — disband your party (leader only).',
  'A party has up to 8 people total: 1 leader and 7 members. Each user can belong to one party per server.',
].join('\n');
