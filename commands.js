import 'dotenv/config';
import { InstallGlobalCommands } from './utils.js';

const ADMIN_SUBCOMMANDS = [
  {
    type: 1,
    name: 'setup',
    description: 'Set this channel and the initial admin role',
    options: [
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
        description: 'Session date as DD-MM-YYYY, e.g. 16-11-2026',
        required: true,
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
        description: 'Scheduled war date as DD-MM-YYYY, e.g. 16-11-2026',
        required: true,
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
        description: 'Session date as DD-MM-YYYY, e.g. 16-11-2026',
        required: true,
      },
    ],
  },
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
        description: 'Upcoming war date as DD-MM-YYYY, e.g. 16-11-2026',
        required: true,
      },
    ],
    integration_types: [0],
    contexts: [0],
  },
  {
    name: 'war-info',
    description: 'Show attendance commands, admin commands, and the war schedule',
    type: 1,
    integration_types: [0],
    contexts: [0],
  },
  {
    name: 'war-admin',
    description: 'Configure the club-war attendance bot',
    type: 1,
    options: ADMIN_SUBCOMMANDS,
    integration_types: [0],
    contexts: [0],
  },
];

for (const variable of ['APP_ID', 'DISCORD_TOKEN']) {
  if (!process.env[variable]) {
    throw new Error(`${variable} is required to register Discord commands.`);
  }
}

await InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
console.log('Registered club-war attendance commands.');
