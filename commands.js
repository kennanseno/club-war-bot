import 'dotenv/config';
import { InstallGlobalCommands } from './utils.js';
import { FIX_PARTY_COMMAND } from './fix-party-command.js';
import { RAN_COMMAND } from './ran-command.js';
import { TOPUP_ADMIN_COMMAND } from './topup-reminder.js';

const ADMIN_SUBCOMMANDS = [
  {
    type: 1,
    name: 'setup',
    description: 'Configure war reminder channels and the initial admin role',
    options: [
      {
        type: 7,
        name: 'war_channel',
        description: 'Channel where war reminders and attendance rosters are posted',
        required: true,
        channel_types: [0, 5],
      },
      {
        type: 7,
        name: 'fund_channel',
        description: 'Channel where guild fund updates are announced',
        required: true,
        channel_types: [0, 5],
      },
      {
        type: 8,
        name: 'admin_role',
        description: 'Role allowed to manage attendance and settings',
        required: true,
      },
    ],
  },
  {
    type: 1,
    name: 'settings',
    description: 'Show the current club-war bot settings',
  },
  {
    type: 1,
    name: 'info',
    description: 'Show admin commands and usage',
  },
  {
    type: 1,
    name: 'role-add',
    description: 'Allow another role to manage attendance and settings',
    options: [
      { type: 8, name: 'role', description: 'Role to authorize', required: true },
    ],
  },
  {
    type: 1,
    name: 'role-remove',
    description: 'Remove a role from the admin allowlist',
    options: [
      { type: 8, name: 'role', description: 'Role to remove', required: true },
    ],
  },
  {
    type: 1,
    name: 'attendance',
    description: 'View attendance for a scheduled session date',
    options: [
      {
        type: 3,
        name: 'date',
        description: 'Session date as MM-DD-YYYY; defaults to the latest war date',
        required: false,
      },
    ],
  },
  {
    type: 1,
    name: 'late',
    description: 'View members who reported they will be late for a scheduled war',
    options: [
      {
        type: 3,
        name: 'date',
        description: 'Scheduled war date as MM-DD-YYYY; defaults to the latest war date',
        required: false,
      },
    ],
  },
  {
    type: 1,
    name: 'add-attendance',
    description: 'Manually add a member to a scheduled session',
    options: [
      { type: 6, name: 'member', description: 'Member to add', required: true },
      {
        type: 3,
        name: 'date',
        description: 'Session date as MM-DD-YYYY, e.g. 11-16-2026',
        required: true,
      },
    ],
  },
  {
    type: 2,
    name: 'fund',
    description: 'Manage the guild fund values and announcement channel',
    options: [
      {
        type: 1,
        name: 'ep',
        description: 'Update the guild E-Points fund',
        options: [
          {
            type: 3,
            name: 'value',
            description: 'Current E-Points fund value',
            required: true,
            max_length: 500,
          },
        ],
      },
      {
        type: 1,
        name: 'gold',
        description: 'Update the guild Gold fund',
        options: [
          {
            type: 3,
            name: 'value',
            description: 'Current Gold fund value',
            required: true,
            max_length: 500,
          },
        ],
      },
      {
        type: 1,
        name: 'php',
        description: 'Update the guild PHP cash fund',
        options: [
          {
            type: 3,
            name: 'value',
            description: 'Current PHP cash fund value',
            required: true,
            max_length: 500,
          },
        ],
      },
      {
        type: 1,
        name: 'channel',
        description: 'Set the channel for guild fund announcements',
        options: [
          {
            type: 7,
            name: 'channel',
            description: 'Channel where fund updates are announced',
            required: true,
            channel_types: [0, 5],
          },
        ],
      },
    ],
  },
  TOPUP_ADMIN_COMMAND,
];

const ALL_COMMANDS = [
  {
    name: 'attended',
    description: 'Record your attendance for tonight’s club war',
    type: 1,
    integration_types: [0],
    contexts: [0],
  },
  {
    name: 'late',
    description: 'Tell admins you will be late for a scheduled club war',
    type: 1,
    options: [
      {
        type: 3,
        name: 'date',
        description: 'Upcoming war date; defaults to today or the next war day',
        required: false,
      },
    ],
    integration_types: [0],
    contexts: [0],
  },
  RAN_COMMAND,
  {
    name: 'guild-fund',
    description: 'Show the guild fund or guild fund commands',
    type: 1,
    options: [
      {
        type: 1,
        name: 'view',
        description: 'Show the current guild EP, Gold, and PHP funds',
      },
      {
        type: 1,
        name: 'info',
        description: 'Show commands for viewing guild funds',
      },
    ],
    integration_types: [0],
    contexts: [0],
  },
  {
    name: 'ran-admin',
    description: 'Configure Ran Online club and guild management features',
    type: 1,
    options: ADMIN_SUBCOMMANDS,
    integration_types: [0],
    contexts: [0],
  },
  FIX_PARTY_COMMAND,
];

for (const variable of ['APP_ID', 'DISCORD_TOKEN']) {
  if (!process.env[variable]) {
    throw new Error(`${variable} is required to register Discord commands.`);
  }
}

await InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
console.log('Registered Ran Online club and guild management commands.');
