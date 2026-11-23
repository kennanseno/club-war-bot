import { BOT_INFO_REMINDER } from './config.js';

export const TOPUP_ADMIN_COMMAND = Object.freeze({
  type: 2,
  name: 'topup',
  description: 'Manage the guild top-up referral reminder',
  options: [
    {
      type: 1,
      name: 'code',
      description: 'Set the guild streamer referral code',
      options: [
        {
          type: 3,
          name: 'code',
          description: 'Referral code used when topping up',
          required: true,
          max_length: 100,
        },
      ],
    },
    {
      type: 1,
      name: 'channel',
      description: 'Set the channel for daily top-up reminders',
      options: [
        {
          type: 7,
          name: 'channel',
          description: 'Channel where daily top-up reminders are posted',
          required: true,
          channel_types: [0, 5],
        },
      ],
    },
    {
      type: 1,
      name: 'enable',
      description: 'Enable daily top-up reminders and non-war reminder callouts',
    },
    {
      type: 1,
      name: 'disable',
      description: 'Disable top-up reminders without clearing settings',
    },
    {
      type: 1,
      name: 'remind',
      description: 'Post the top-up reminder now',
    },
    {
      type: 1,
      name: 'info',
      description: 'Show top-up reminder commands and usage',
    },
    {
      type: 1,
      name: 'settings',
      description: 'Show top-up reminder configuration',
    },
  ],
});

export function getTopupInfoMessage() {
  return [
    '**Top-up referral reminder commands** (authorized admins):',
    '`/ran-admin topup code code:<text>` — save the streamer referral code.',
    '`/ran-admin topup channel channel:<channel>` — choose where daily reminders are posted.',
    '`/ran-admin topup enable` — enable scheduled reminders and the non-war reminder callout.',
    '`/ran-admin topup disable` — disable scheduled reminders and the callout without clearing settings.',
    '`/ran-admin topup remind` — post a reminder now; requires a saved code and channel, but works while disabled.',
    '`/ran-admin topup info` — show this command guide.',
    '`/ran-admin topup settings` — view the saved referral code, channel, and enabled state.',
    'After setting a code and channel, enable reminders. The bot posts an `@everyone` reminder daily at 6:00 PM Manila time and again at 9:05 PM on war days. Enabled non-war reminders also include a short referral-code callout.',
  ].join('\n');
}

export function getTopupSettingsMessage(topup = {}) {
  const enabled = topup.enabled !== false;
  return [
    '**Top-up referral settings**',
    `**Status:** ${enabled ? 'Enabled' : 'Disabled'}`,
    `**Referral code:** ${topup.code ? `\`${escapeReferralCode(topup.code)}\`` : 'Not set'}`,
    `**Reminder channel:** ${topup.channelId ? `<#${topup.channelId}>` : 'Not set'}`,
    '**Reminder times:** 6:00 PM daily; 9:05 PM on war days (Asia/Manila)',
  ].join('\n');
}

export function escapeReferralCode(code) {
  return code
    .replace(/@/g, '@\u200b')
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/([*_~|[\]()<>])/g, '\\$1')
    .replace(/[\u0000-\u001f\u007f]/g, ' ');
}

export function getTopupReferralReminderMessage(code) {
  return `@everyone\n**Support our guild streamer when you top up!** Remember to use referral code: \`${escapeReferralCode(code)}\`.\n\n${BOT_INFO_REMINDER}`;
}

export function getTopupReferralCallout(code) {
  return `**Topping up?** Support our guild streamer with referral code \`${escapeReferralCode(code)}\`.`;
}
