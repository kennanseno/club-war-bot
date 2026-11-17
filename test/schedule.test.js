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
import { getScheduledEvents } from '../scheduler.js';
import { getWarInfoMessage } from '../config.js';

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
  assert.doesNotMatch(events[0].message, /guild-fund|\/war-admin fund|\/war-admin late/);
  assert.ok(events[0].message.endsWith('**Need help with the bot commands? Use `/war-info`.**'));
});

test('war-day preparation reminder runs at 5 PM Manila time', () => {
  const event = getScheduledEvents(
    getManilaParts(new Date('2026-11-16T09:00:00Z')),
  )[0];

  assert.equal(event.key, 'war_day_1700');
  assert.equal(event.everyone, true);
  assert.match(event.message, /@everyone \*\*Club war is tonight at 8:00 PM—gear up, squad up, and get ready for the W!\*\*/);
  assert.match(event.message, /Regroup:\*\* 7:00 PM–8:00 PM Manila time/);
  assert.ok(event.message.endsWith('**Need help with the bot commands? Use `/war-info`.**'));
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
  assert.ok(reminder.message.endsWith('**Need help with the bot commands? Use `/war-info`.**'));

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
    '2026-11-16T11:30:00Z',
    '2026-11-16T13:30:00Z',
  ];

  for (const time of reminderTimes) {
    const event = getScheduledEvents(getManilaParts(new Date(time))).find(
      (scheduledEvent) => !scheduledEvent.roster,
    );
    assert.ok(event, `expected a reminder at ${time}`);
    assert.ok(event.message.endsWith('**Need help with the bot commands? Use `/war-info`.**'));
    assert.match(event.message, /Regroup.*7:00 PM–8:00 PM/s);
    assert.match(event.message, /kicked at 7:40 PM/);
    assert.match(event.message, /\*\*Running late\?\*\* Use `\/late \[date:MM-DD-YYYY\]`/);
    assert.match(event.message, /\*\*Attendance:\*\* Members use `\/attended` from 7:30 PM until 9:30 PM/);
    assert.doesNotMatch(event.message, /Guild fund:|\/guild-fund|\/war-admin/);
    if (time === '2026-11-16T13:30:00Z') {
      assert.match(event.message, /Need help with the bot commands\? Use `\/war-info`/);
    }
    assert.match(event.message, /\*\*Regroup/);
    assert.match(event.message, /\*\*Offline guild members will be kicked/);
    assert.match(event.message, /\n\n\*\*Club war:/);
    assert.match(event.message, /\n\n\*\*Attendance:/);
  }
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
  assert.ok(warStart.message.endsWith('**Need help with the bot commands? Use `/war-info`.**'));

  const warEnd = getScheduledEvents(
    getManilaParts(new Date('2026-11-16T13:00:00Z')),
  ).find((event) => event.key === 'war_end_2100');
  assert.equal(warEnd.key, 'war_end_2100');
  assert.equal(warEnd.everyone, true);
  assert.match(warEnd.message, /@everyone \*\*GG, everyone! Club war is over—good run, squad!\*\*/);
  assert.match(warEnd.message, /30 minutes left to use `\/attended`/i);
  assert.match(warEnd.message, /Attendance closes at 9:30 PM Manila time/);
  assert.match(warEnd.message, /No check-in means no salary for this war!/);
  assert.match(warEnd.message, /Need help with the bot commands\? Use `\/war-info`/);
  assert.ok(warEnd.message.endsWith('**Need help with the bot commands? Use `/war-info`.**'));

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
  assert.match(event.message, /Need help with the bot commands\? Use `\/war-info`/);
});

test('non-war day reminder is not scheduled at other times or on war days', () => {
  const offDayBeforeReminder = getScheduledEvents(
    getManilaParts(new Date('2026-11-17T10:59:00Z')),
  );
  const warDay = getScheduledEvents(getManilaParts(new Date('2026-11-16T11:30:00Z')));

  assert.equal(offDayBeforeReminder.length, 0);
  assert.equal(warDay.some((event) => event.key === 'non_war_day_schedule'), false);
});

test('war info shows commands, configured schedule, and server setup', () => {
  const message = getWarInfoMessage({
    channelId: 'war-channel',
    adminRoleIds: ['war-admin-role'],
  });

  assert.match(message, /Monday, Wednesday, and Saturday, 8:00 PM–9:00 PM Asia\/Manila/);
  assert.match(message, /\*\*Regroup:\*\* 7:00 PM–8:00 PM Manila time/);
  assert.match(message, /`\/attended` from 7:30 PM until 9:30 PM/);
  assert.match(message, /Use `\/late \[date:MM-DD-YYYY\]`/);
  assert.match(message, /date defaults to today on war days or the next war date otherwise/);
  assert.match(message, /`\/war-admin attendance \[date:MM-DD-YYYY\]`.*defaults to the latest war date/);
  assert.match(message, /`\/war-admin late \[date:MM-DD-YYYY\]`.*defaults to the latest war date/);
  assert.match(message, /`\/guild-fund view`/);
  assert.match(message, /`\/war-admin fund ep value:<text>`/);
  assert.match(message, /`\/war-admin fund gold value:<text>`/);
  assert.match(message, /`\/war-admin fund php value:<text>`/);
  assert.match(message, /`\/war-admin fund channel channel:<channel>`/);
  assert.match(message, /`\/guild-fund info`/);
  assert.match(message, /All commands can be used in any server channel/);
  assert.match(
    message,
    /`\/war-admin setup war_channel:<channel> fund_channel:<channel> admin_role:<role>`/,
  );
  assert.match(message, /<\#war-channel>/);
  assert.match(message, /<@&war-admin-role>/);
  assert.match(message, /Reminders:\*\* 5:00 PM, 6:00 PM, 6:30 PM, 7:00 PM, 7:30 PM, 7:40 PM, 8:00 PM, 9:00 PM/);
});

test('war info explains setup when the server is not configured', () => {
  assert.match(getWarInfoMessage(), /has not been configured/);
  assert.match(getWarInfoMessage(), /`\/war-admin setup`/);
});
