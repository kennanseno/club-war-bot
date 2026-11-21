import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAttendanceMessage,
  getAttendanceStatus,
  formatWarDate,
  getDefaultLateReportDate,
  getMostRecentWarDate,
  isWarDate,
  parseUpcomingWarDateInput,
  parseWarDateInput,
} from '../schedule.js';
import { getManilaParts } from '../schedule.js';
import { getScheduledEvents, runSchedulerTick } from '../scheduler.js';
import {
  BOT_INFO_REMINDER,
  getRanAdminInfoMessage,
  getRanInfoMessage,
} from '../config.js';
import { RAN_COMMAND } from '../ran-command.js';
import { splitDiscordMessages } from '../fix-party.js';
import {
  TOPUP_ADMIN_COMMAND,
  getTopupReferralCallout,
  getTopupReferralReminderMessage,
  getTopupInfoMessage,
  getTopupSettingsMessage,
} from '../topup-reminder.js';

test('ran command exposes the member info subcommand', () => {
  assert.equal(RAN_COMMAND.name, 'ran');
  assert.deepEqual(
    RAN_COMMAND.options.map((option) => option.name),
    ['info'],
  );
});

test('topup admin commands expose configuration, toggles, and manual posting', () => {
  assert.equal(TOPUP_ADMIN_COMMAND.name, 'topup');
  assert.deepEqual(
    TOPUP_ADMIN_COMMAND.options.map((option) => option.name),
    ['code', 'channel', 'enable', 'disable', 'remind', 'info', 'settings'],
  );
  assert.equal(
    TOPUP_ADMIN_COMMAND.options.find((option) => option.name === 'code')
      .options[0].max_length,
    100,
  );
});

test('top-up info documents each command and explains scheduled and manual usage', () => {
  const message = getTopupInfoMessage();
  for (const command of ['code', 'channel', 'enable', 'disable', 'remind', 'info', 'settings']) {
    assert.match(message, new RegExp(`/ran-admin topup ${command}`));
  }
  assert.match(message, /6:00 PM Manila time/);
  assert.match(message, /works while disabled/);
  assert.match(message, /authorized admins/);
});

test('top-up settings show saved values, escape the code, and report unset configuration', () => {
  const configured = getTopupSettingsMessage({
    code: '@everyone `CODE`',
    channelId: 'topup-channel',
    enabled: false,
  });
  assert.match(configured, /\*\*Status:\*\* Disabled/);
  assert.ok(configured.includes('@\u200beveryone'));
  assert.ok(configured.includes('\\`CODE\\`'));
  assert.match(configured, /<\#topup-channel>/);
  assert.match(configured, /6:00 PM Asia\/Manila/);

  const unset = getTopupSettingsMessage();
  assert.match(unset, /\*\*Status:\*\* Enabled/);
  assert.match(unset, /\*\*Referral code:\*\* Not set/);
  assert.match(unset, /\*\*Reminder channel:\*\* Not set/);
});

test('top-up referral messages escape user-provided mentions and markdown', () => {
  const message = getTopupReferralReminderMessage('@everyone `bad` [link](x)');
  assert.match(message, /^@everyone\n/);
  assert.match(message, /@\u200beveryone/);
  assert.doesNotMatch(message, /`bad`/);
  assert.doesNotMatch(message, /\[link\]\(x\)/);
  assert.ok(message.endsWith(BOT_INFO_REMINDER));
  assert.match(getTopupReferralCallout('STREAMER42'), /STREAMER42/);
});

test('daily top-up reminder sends to its configured channel and allows only everyone ping', async () => {
  const data = {
    guilds: {
      guild: {
        channelId: 'war-channel',
        adminRoleIds: [],
        topup: {
          code: 'STREAMER42',
          channelId: 'topup-channel',
        },
      },
    },
    announcements: [],
  };
  const sent = [];
  await runSchedulerTick(new Date('2026-11-17T10:00:00Z'), {
    read: async () => data,
    update: async (mutate) => mutate(data),
    request: async (endpoint, options) => sent.push({ endpoint, options }),
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].endpoint, 'channels/topup-channel/messages');
  assert.match(sent[0].options.body.content, /STREAMER42/);
  assert.deepEqual(sent[0].options.body.allowed_mentions, { parse: ['everyone'] });
  assert.deepEqual(data.announcements, ['guild:2026-11-17:topup_referral_1800']);
  await runSchedulerTick(new Date('2026-11-17T10:00:30Z'), {
    read: async () => data,
    update: async (mutate) => mutate(data),
    request: async (endpoint, options) => sent.push({ endpoint, options }),
  });
  assert.equal(sent.length, 1, 'daily reminder is not posted twice in the same minute');
});

test('daily top-up reminder is scheduled on war days as well', async () => {
  const data = {
    guilds: {
      guild: {
        channelId: 'war-channel',
        adminRoleIds: [],
        topup: { code: 'STREAMER42', channelId: 'topup-channel' },
      },
    },
    announcements: [],
  };
  const sent = [];
  await runSchedulerTick(new Date('2026-11-16T10:00:00Z'), {
    read: async () => data,
    update: async (mutate) => mutate(data),
    request: async (endpoint, options) => sent.push({ endpoint, options }),
  });
  assert.ok(sent.some(({ endpoint }) => endpoint === 'channels/topup-channel/messages'));
  assert.ok(sent.some(({ endpoint }) => endpoint === 'channels/war-channel/messages'));
});

test('disabled or incomplete top-up configuration does not post', async () => {
  for (const topup of [
    { code: 'STREAMER42', channelId: 'topup-channel', enabled: false },
    { code: 'STREAMER42', enabled: true },
    { channelId: 'topup-channel', enabled: true },
  ]) {
    const data = {
      guilds: { guild: { channelId: 'war-channel', adminRoleIds: [], topup } },
      announcements: [],
    };
    const sent = [];
    await runSchedulerTick(new Date('2026-11-17T10:00:00Z'), {
      read: async () => data,
      update: async (mutate) => mutate(data),
      request: async (...args) => sent.push(args),
    });
    assert.deepEqual(sent, []);
    assert.deepEqual(data.announcements, []);
  }
});

test('non-war reminder includes the referral callout only when configured and enabled', async () => {
  for (const enabled of [true, false]) {
    const data = {
      guilds: {
        guild: {
          channelId: 'war-channel',
          adminRoleIds: [],
          topup: {
            code: 'STREAMER42',
            channelId: 'topup-channel',
            enabled,
          },
        },
      },
      announcements: [],
    };
    const sent = [];
    await runSchedulerTick(new Date('2026-11-17T11:00:00Z'), {
      read: async () => data,
      update: async (mutate) => mutate(data),
      request: async (endpoint, options) => sent.push({ endpoint, options }),
    });
    const nonWarReminder = sent.find(
      ({ endpoint }) => endpoint === 'channels/war-channel/messages',
    );
    assert.ok(nonWarReminder);
    assert.equal(
      nonWarReminder.options.body.content.includes('STREAMER42'),
      enabled,
    );
    assert.ok(nonWarReminder.options.body.content.endsWith(BOT_INFO_REMINDER));
  }
});

test('attendance opens at 7:30 PM and closes at 9:30 PM Manila time', () => {
  assert.equal(getAttendanceStatus(new Date('2026-11-16T11:29:59Z')).status, 'too-early');
  assert.equal(getAttendanceStatus(new Date('2026-11-16T11:30:00Z')).status, 'open');
  assert.equal(getAttendanceStatus(new Date('2026-11-16T12:00:00Z')).status, 'open');
  assert.equal(getAttendanceStatus(new Date('2026-11-16T12:59:59Z')).status, 'open');
  assert.equal(getAttendanceStatus(new Date('2026-11-16T13:29:59Z')).status, 'open');
  assert.equal(getAttendanceStatus(new Date('2026-11-16T13:30:00Z')).status, 'closed');
});

test('non-war days show the normal schedule and next session', () => {
  const status = getAttendanceStatus(new Date('2026-11-15T12:00:00Z'));
  assert.equal(status.status, 'not-war-day');
  assert.equal(status.nextWarDate, '2026-11-16');
  assert.match(getAttendanceMessage(status), /Monday, Wednesday, and Saturday, 8:00 PM–9:00 PM/);
  assert.match(getAttendanceMessage(status), /next attendance window is 11-16-2026/);
});

test('war dates are displayed as MM-DD-YYYY', () => {
  assert.equal(formatWarDate('2026-11-16'), '11-16-2026');
  assert.match(
    getAttendanceMessage(getAttendanceStatus(new Date('2026-11-16T11:30:00Z'))),
    /Attendance was recorded for 11-16-2026/,
  );
});

test('closed sessions point to the next scheduled date', () => {
  const status = getAttendanceStatus(new Date('2026-11-18T13:30:00Z'));
  assert.equal(status.status, 'closed');
  assert.equal(status.nextWarDate, '2026-11-21');
});

test('only valid Monday, Wednesday, and Saturday dates qualify as war dates', () => {
  assert.equal(isWarDate('2026-11-16'), true);
  assert.equal(isWarDate('2026-11-18'), true);
  assert.equal(isWarDate('2026-11-21'), true);
  assert.equal(isWarDate('2026-11-17'), false);
  assert.equal(isWarDate('2026-02-30'), false);
  assert.equal(isWarDate('invalid'), false);
});

test('admin date input accepts MM-DD-YYYY and normalizes to the stored session date', () => {
  assert.equal(parseWarDateInput('11-16-2026'), '2026-11-16');
  assert.equal(parseWarDateInput('11-18-2026'), '2026-11-18');
  assert.equal(parseWarDateInput('11-21-2026'), '2026-11-21');
  assert.equal(parseWarDateInput('11-17-2026'), null);
  assert.equal(parseWarDateInput('02-31-2026'), null);
  assert.equal(parseWarDateInput('16-11-2026'), null);
  assert.equal(parseWarDateInput('2026-11-16'), null);
});

test('default admin date uses today on war days and the most recent prior war day otherwise', () => {
  assert.equal(getMostRecentWarDate(new Date('2026-11-16T00:00:00Z')), '2026-11-16');
  assert.equal(getMostRecentWarDate(new Date('2026-11-17T00:00:00Z')), '2026-11-16');
  assert.equal(getMostRecentWarDate(new Date('2026-11-22T00:00:00Z')), '2026-11-21');
  assert.equal(getMostRecentWarDate(new Date('2026-11-23T00:00:00Z')), '2026-11-23');
});

test('late report date accepts today and future war dates but rejects past and non-war dates', () => {
  const now = new Date('2026-11-15T16:00:00Z');

  assert.equal(parseUpcomingWarDateInput('11-16-2026', now), '2026-11-16');
  assert.equal(parseUpcomingWarDateInput('11-18-2026', now), '2026-11-18');
  assert.equal(parseUpcomingWarDateInput('11-14-2026', now), null);
  assert.equal(parseUpcomingWarDateInput('11-17-2026', now), null);
  assert.equal(parseUpcomingWarDateInput('02-31-2026', now), null);
});

test('default late report date uses today on war days and the next war date otherwise', () => {
  assert.equal(getDefaultLateReportDate(new Date('2026-11-16T00:00:00Z')), '2026-11-16');
  assert.equal(getDefaultLateReportDate(new Date('2026-11-17T00:00:00Z')), '2026-11-18');
  assert.equal(getDefaultLateReportDate(new Date('2026-11-20T00:00:00Z')), '2026-11-21');
  assert.equal(getDefaultLateReportDate(new Date('2026-11-22T00:00:00Z')), '2026-11-23');
});

test('non-war days get a single 7:00 PM weekly schedule reminder', () => {
  const parts = getManilaParts(new Date('2026-11-17T11:00:00Z'));
  const events = getScheduledEvents(parts);

  assert.equal(events.length, 1);
  assert.equal(events[0].key, 'non_war_day_schedule');
  assert.equal(events[0].everyone, true);
  assert.match(events[0].message, /No club war is scheduled for tonight/);
  assert.doesNotMatch(events[0].message, /Regroup at 7:30 PM/);
  assert.match(events[0].message, /Monday, Wednesday, and Saturday, 8:00 PM–9:00 PM/);
  assert.match(events[0].message, /On war days, use `\/attended` from 7:30 PM until 9:30 PM/);
  assert.match(events[0].message, /records participation after you join/);
  assert.match(events[0].message, /Use `\/late \[date:MM-DD-YYYY\]` when you expect to arrive late/);
  assert.match(events[0].message, /helps the guild keep you instead of kicking you offline at 7:40 PM/);
  assert.doesNotMatch(events[0].message, /guild-fund|\/ran-admin fund|\/ran-admin late/);
  assert.ok(events[0].message.endsWith(BOT_INFO_REMINDER));
});

test('war-day preparation reminder runs at 5 PM Manila time', () => {
  const event = getScheduledEvents(
    getManilaParts(new Date('2026-11-16T09:00:00Z')),
  )[0];

  assert.equal(event.key, 'war_day_1700');
  assert.equal(event.everyone, true);
  assert.match(event.message, /@everyone \*\*Club war is tonight at 8:00 PM—gear up, squad up, and get ready for the W!\*\*/);
  assert.match(event.message, /Regroup:\*\* 7:00 PM–8:00 PM Manila time/);
  assert.ok(event.message.endsWith(BOT_INFO_REMINDER));
});

test('6 PM and 6:30 PM reminders use gamer-style preparation wording', () => {
  const sixPm = getScheduledEvents(
    getManilaParts(new Date('2026-11-16T10:00:00Z')),
  ).find((item) => item.key === 'war_day_1800');
  const sixThirtyPm = getScheduledEvents(
    getManilaParts(new Date('2026-11-16T10:30:00Z')),
  ).find((item) => item.key === 'regroup_1830');

  assert.match(
    sixPm.message,
    /charge up, check your loadout, and prepare for the raid/,
  );
  assert.match(
    sixThirtyPm.message,
    /Regroup starts at 7:00 PM—get squad-ready/,
  );
});

test('7 PM reminder says regroup starts at 7 PM', () => {
  const event = getScheduledEvents(
    getManilaParts(new Date('2026-11-16T11:00:00Z')),
  ).find((item) => item.key === 'regroup_1900');

  assert.ok(event);
  assert.equal(event.everyone, true);
  assert.match(
    event.message,
    /@everyone \*\*Regroup starts now: 7:00 PM–8:00 PM Manila time. Squad up and get ready/,
  );
  assert.match(event.message, /club war starts at 8:00 PM/);
});

test('7:15 PM reminder repeats the regroup reminder', () => {
  const event = getScheduledEvents(
    getManilaParts(new Date('2026-11-16T11:15:00Z')),
  ).find((item) => item.key === 'regroup_1915');

  assert.ok(event);
  assert.equal(event.everyone, true);
  assert.match(
    event.message,
    /@everyone \*\*Regroup starts now: 7:00 PM–8:00 PM Manila time. Squad up and get ready/,
  );
  assert.match(event.message, /club war starts at 8:00 PM/);
});

test('7:30 PM reminder says regroup continues until war starts', () => {
  const event = getScheduledEvents(
    getManilaParts(new Date('2026-11-16T11:30:00Z')),
  ).find((item) => item.key === 'regroup_1930');

  assert.ok(event);
  assert.match(
    event.message,
    /@everyone \*\*Members can now use `\/attended` to record their attendance for the war/,
  );
  assert.doesNotMatch(event.message, /Regroup ends/);
  assert.match(event.message, /Members can now use `\/attended` to record their attendance for the war/);
  assert.match(event.message, /Attendance is open from 7:30 PM until 9:30 PM/);
});

test('7:40 PM war-day reminder explains offline kicks and late-notice protection', () => {
  const events = getScheduledEvents(
    getManilaParts(new Date('2026-11-16T11:40:00Z')),
  );
  const reminder = events.find((event) => event.key === 'late_kick_1940');
  const lateRoster = events.find((event) => event.key === 'late_roster_1940');

  assert.ok(reminder);
  assert.equal(reminder.everyone, true);
  assert.match(reminder.message, /@everyone/);
  assert.match(reminder.message, /Offline kick now/);
  assert.match(reminder.message, /Late-notice members stay/);
  assert.doesNotMatch(reminder.message, /\/late/);
  assert.match(reminder.message, /Once you join, use `\/attended` to record your attendance/);
  assert.ok(reminder.message.endsWith(BOT_INFO_REMINDER));

  assert.ok(lateRoster);
  assert.equal(lateRoster.lateRoster, true);
  assert.equal(lateRoster.rosterTitle, 'Members who reported late for 11-16-2026:');

  const offDayEvents = getScheduledEvents(
    getManilaParts(new Date('2026-11-17T11:40:00Z')),
  );
  assert.equal(offDayEvents.some((event) => event.key === 'late_kick_1940'), false);
  assert.equal(offDayEvents.some((event) => event.key === 'late_roster_1940'), false);
});

test('all war-day announcements include the regroup, kick-off, and late notice', () => {
  const reminderTimes = [
    '2026-11-16T09:00:00Z',
    '2026-11-16T10:00:00Z',
    '2026-11-16T10:30:00Z',
    '2026-11-16T11:00:00Z',
    '2026-11-16T11:15:00Z',
    '2026-11-16T11:30:00Z',
    '2026-11-16T13:30:00Z',
  ];

  for (const time of reminderTimes) {
    const event = getScheduledEvents(getManilaParts(new Date(time))).find(
      (scheduledEvent) => !scheduledEvent.roster && scheduledEvent.message,
    );
    assert.ok(event, `expected a reminder at ${time}`);
    assert.ok(event.message.endsWith(BOT_INFO_REMINDER));
    assert.match(event.message, /Regroup.*7:00 PM–8:00 PM/s);
    assert.match(event.message, /kicked at 7:40 PM/);
    assert.match(event.message, /\*\*Running late\?\*\* Use `\/late \[date:MM-DD-YYYY\]`/);
    assert.match(event.message, /\*\*Attendance:\*\* Members use `\/attended` from 7:30 PM until 9:30 PM/);
    assert.doesNotMatch(event.message, /Guild fund:|\/guild-fund|\/ran-admin/);
    if (time === '2026-11-16T13:30:00Z') {
      assert.match(event.message, /Need help with the bot commands\? Use `\/ran info`/);
    }
    assert.match(event.message, /\*\*Regroup/);
    assert.match(event.message, /\*\*Offline guild members will be kicked/);
    assert.match(event.message, /\n\n\*\*Club war:/);
    assert.match(event.message, /\n\n\*\*Attendance:/);
  }
});

test('9:15 PM reminder tells members to use attended before close', () => {
  const event = getScheduledEvents(
    getManilaParts(new Date('2026-11-16T13:15:00Z')),
  ).find((item) => item.key === 'attendance_final_2115');

  assert.ok(event);
  assert.equal(event.everyone, true);
  assert.match(
    event.message,
    /Final check: use `\/attended` now to record your attendance before it closes at 9:30 PM Manila time/,
  );
  assert.doesNotMatch(event.message, /PM PM/);
  assert.ok(event.message.endsWith(BOT_INFO_REMINDER));

  const roster = getScheduledEvents(
    getManilaParts(new Date('2026-11-16T13:15:00Z')),
  ).find((item) => item.key === 'attendance_roster_2115');
  assert.ok(roster);
  assert.equal(roster.roster, true);
  assert.equal(roster.rosterTitle, 'Attendance recorded so far for 11-16-2026:');
});

test('war-day start and end reminders run at 8 PM and 9 PM Manila time', () => {
  const warStart = getScheduledEvents(
    getManilaParts(new Date('2026-11-16T12:00:00Z')),
  ).find((event) => !event.roster);
  assert.equal(warStart.key, 'war_start_2000');
  assert.equal(warStart.everyone, true);
  assert.match(warStart.message, /@everyone \*\*GLHF, everyone! Club war starts now—lock in and let's get that W!\*\*/);
  assert.match(warStart.message, /used `\/attended` yet, check in by 9:30 PM Manila time/i);
  assert.match(warStart.message, /No check-in means no salary for this war!/);
  assert.ok(warStart.message.endsWith(BOT_INFO_REMINDER));

  const warEnd = getScheduledEvents(
    getManilaParts(new Date('2026-11-16T13:00:00Z')),
  ).find((event) => event.key === 'war_end_2100');
  assert.equal(warEnd.key, 'war_end_2100');
  assert.equal(warEnd.everyone, true);
  assert.match(warEnd.message, /@everyone \*\*GG, everyone! Club war is over—good run, squad!\*\*/);
  assert.match(warEnd.message, /30 minutes left to use `\/attended`/i);
  assert.match(warEnd.message, /Attendance closes at 9:30 PM Manila time/);
  assert.match(warEnd.message, /No check-in means no salary for this war!/);
  assert.match(warEnd.message, /Need help with the bot commands\? Use `\/ran info`/);
  assert.ok(warEnd.message.endsWith(BOT_INFO_REMINDER));

  const attendanceRoster = getScheduledEvents(
    getManilaParts(new Date('2026-11-16T13:00:00Z')),
  ).find((event) => event.key === 'attendance_roster_2100');
  assert.ok(attendanceRoster);
  assert.equal(attendanceRoster.roster, true);
  assert.equal(attendanceRoster.rosterTitle, 'Attendance recorded so far for 11-16-2026:');

  const finalAttendanceRoster = getScheduledEvents(
    getManilaParts(new Date('2026-11-16T13:30:00Z')),
  ).find((event) => event.key === 'attendance_roster');
  assert.ok(finalAttendanceRoster);
  assert.equal(finalAttendanceRoster.roster, true);
  assert.equal(finalAttendanceRoster.rosterTitle, 'Final attendance for 11-16-2026:');
});

test('9:30 PM attendance close uses gamer-style participation wording', () => {
  const event = getScheduledEvents(
    getManilaParts(new Date('2026-11-16T13:30:00Z')),
  ).find((item) => item.key === 'attendance_closed');

  assert.ok(event);
  assert.match(
    event.message,
    /Attendance is now closed. GG to the squad—participation is locked/,
  );
  assert.match(event.message, /Need help with the bot commands\? Use `\/ran info`/);
});

test('non-war day reminder is not scheduled at other times or on war days', () => {
  const offDayBeforeReminder = getScheduledEvents(
    getManilaParts(new Date('2026-11-17T10:59:00Z')),
  );
  const warDay = getScheduledEvents(getManilaParts(new Date('2026-11-16T11:30:00Z')));

  assert.equal(offDayBeforeReminder.length, 0);
  assert.equal(warDay.some((event) => event.key === 'non_war_day_schedule'), false);
});

test('Ran member info contains member commands and schedule but no admin commands', () => {
  const message = getRanInfoMessage();

  assert.match(message, /Monday, Wednesday, and Saturday, 8:00 PM–9:00 PM Asia\/Manila/);
  assert.match(message, /\*\*Regroup:\*\* 7:00 PM–8:00 PM Manila time/);
  assert.match(message, /`\/attended` from 7:30 PM until 9:30 PM/);
  assert.match(message, /Use `\/late \[date:MM-DD-YYYY\]`/);
  assert.match(message, /date defaults to today on war days or the next war date otherwise/);
  assert.match(message, /`\/guild-fund view`/);
  assert.match(message, /`\/ran info`/);
  assert.match(message, /`\/fix-party add name:@user class:<class> type:<type>`/);
  assert.match(message, /Member commands can be used in any server channel/);
  assert.doesNotMatch(message, /\/ran-admin|admin commands|current server configuration/i);
  assert.match(message, /Reminders:\*\* 5:00 PM, 6:00 PM, 6:30 PM, 7:00 PM, 7:15 PM, 7:30 PM, 7:40 PM, 8:00 PM, 9:00 PM, 9:15 PM/);
});

test('Ran admin info shows admin commands and current server configuration', () => {
  const message = getRanAdminInfoMessage({
    channelId: 'war-channel',
    adminRoleIds: ['ran-admin-role'],
  });

  assert.match(message, /`\/ran-admin attendance \[date:MM-DD-YYYY\]`.*defaults to the latest war date/);
  assert.match(message, /`\/ran-admin late \[date:MM-DD-YYYY\]`.*defaults to the latest war date/);
  assert.match(message, /`\/ran-admin fund ep value:<text>`/);
  assert.match(message, /`\/ran-admin fund gold value:<text>`/);
  assert.match(message, /`\/ran-admin fund php value:<text>`/);
  assert.match(message, /`\/ran-admin fund channel channel:<channel>`/);
  assert.match(message, /`\/ran-admin info`/);
  assert.match(message, /`\/ran-admin topup remind`/);
  assert.match(
    message,
    /`\/ran-admin setup war_channel:<channel> fund_channel:<channel> admin_role:<role>`/,
  );
  assert.match(message, /<\#war-channel>/);
  assert.match(message, /<@&ran-admin-role>/);
  assert.doesNotMatch(message, /\/war-admin|\/ran-bot/);
});

test('Ran admin info explains setup when the server is not configured', () => {
  assert.match(getRanAdminInfoMessage(), /has not been configured/);
  assert.match(getRanAdminInfoMessage(), /`\/ran-admin setup`/);
});

test('member and admin guides fit Discord message limits after splitting', () => {
  for (const message of [getRanInfoMessage(), getRanAdminInfoMessage()]) {
    const pages = splitDiscordMessages(message.split('\n'));
    assert.ok(pages.every((page) => page.length <= 1900));
  }
});
