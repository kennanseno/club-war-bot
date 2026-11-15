import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAttendanceMessage,
  getAttendanceStatus,
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
  assert.match(getAttendanceMessage(status), /next attendance window is .*2026/);
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

test('admin date input accepts DD-MM-YYYY and normalizes to the stored session date', () => {
  assert.equal(parseWarDateInput('16-11-2026'), '2026-11-16');
  assert.equal(parseWarDateInput('18-11-2026'), '2026-11-18');
  assert.equal(parseWarDateInput('21-11-2026'), '2026-11-21');
  assert.equal(parseWarDateInput('17-11-2026'), null);
  assert.equal(parseWarDateInput('31-02-2026'), null);
  assert.equal(parseWarDateInput('2026-11-16'), null);
});

test('late report date accepts today and future war dates but rejects past and non-war dates', () => {
  const now = new Date('2026-11-15T16:00:00Z');

  assert.equal(parseUpcomingWarDateInput('16-11-2026', now), '2026-11-16');
  assert.equal(parseUpcomingWarDateInput('18-11-2026', now), '2026-11-18');
  assert.equal(parseUpcomingWarDateInput('14-11-2026', now), null);
  assert.equal(parseUpcomingWarDateInput('17-11-2026', now), null);
  assert.equal(parseUpcomingWarDateInput('31-02-2026', now), null);
});

test('non-war days get a single 7:30 PM weekly schedule reminder', () => {
  const parts = getManilaParts(new Date('2026-11-17T11:30:00Z'));
  const events = getScheduledEvents(parts);

  assert.equal(events.length, 1);
  assert.equal(events[0].key, 'non_war_day_schedule');
  assert.equal(events[0].everyone, true);
  assert.match(events[0].message, /No club war is scheduled for tonight/);
  assert.doesNotMatch(events[0].message, /Regroup at 7:30 PM/);
  assert.match(events[0].message, /Monday, Wednesday, and Saturday, 8:00 PM–9:00 PM/);
  assert.match(events[0].message, /\*\*Attendance:\*\* Members use \/attended from 7:30 PM until 9:30 PM/);
  assert.match(events[0].message, /Use \/late date:DD-MM-YYYY to notify admins in advance/);
  assert.match(events[0].message, /\/war-admin late date:DD-MM-YYYY/);
  assert.match(events[0].message, /\*\*Admins:\*\* Use \/war-admin/);
  assert.ok(events[0].message.endsWith('**Need help with the bot commands? Use /war-info.**'));
});

test('war-day preparation reminder runs at 5 PM Manila time', () => {
  const event = getScheduledEvents(
    getManilaParts(new Date('2026-11-16T09:00:00Z')),
  )[0];

  assert.equal(event.key, 'war_day_1700');
  assert.equal(event.everyone, true);
  assert.match(event.message, /@everyone \*\*Club war is tonight at 8:00 PM—please start getting ready!\*\*/);
  assert.match(event.message, /Regroup:\*\* 7:30 PM/);
  assert.ok(event.message.endsWith('**Need help with the bot commands? Use /war-info.**'));
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
    assert.ok(event.message.endsWith('**Need help with the bot commands? Use /war-info.**'));
    assert.match(event.message, /Regroup.*7:30 PM/s);
    assert.match(event.message, /kicked at 7:40 PM/);
    assert.match(event.message, /Running late for a war\? Use \/late and select the war date to notify admins/);
    assert.match(event.message, /\*\*Attendance:\*\* Members use \/attended from 7:30 PM until 9:30 PM/);
    assert.match(event.message, /\*\*Admins:\*\* Use \/war-admin/);
    if (time === '2026-11-16T13:30:00Z') {
      assert.match(event.message, /Need help with the bot commands\? Use \/war-info/);
    }
    assert.match(event.message, /\*\*Regroup/);
    assert.match(event.message, /\*\*Offline guild members will be kicked/);
    assert.match(event.message, /\*\*Running late for a war\?/);
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
  assert.match(warStart.message, /@everyone \*\*GLHF, everyone! Club war starts now—let's get that win!\*\*/);
  assert.match(warStart.message, /used \/attended yet, check in by 9:30 PM Manila time/i);
  assert.match(warStart.message, /No check-in means no salary for this war!/);
  assert.ok(warStart.message.endsWith('**Need help with the bot commands? Use /war-info.**'));

  const warEnd = getScheduledEvents(
    getManilaParts(new Date('2026-11-16T13:00:00Z')),
  ).find((event) => !event.roster);
  assert.equal(warEnd.key, 'war_end_2100');
  assert.equal(warEnd.everyone, true);
  assert.match(warEnd.message, /@everyone \*\*GG, everyone! Club war is over!\*\*/);
  assert.match(warEnd.message, /used \/attended yet, check in by 9:30 PM Manila time/i);
  assert.match(warEnd.message, /No check-in means no salary for this war!/);
  assert.match(warEnd.message, /Need help with the bot commands\? Use \/war-info/);
  assert.ok(warEnd.message.endsWith('**Need help with the bot commands? Use /war-info.**'));
});

test('non-war day reminder is not scheduled at other times or on war days', () => {
  const offDayBeforeReminder = getScheduledEvents(
    getManilaParts(new Date('2026-11-17T11:29:00Z')),
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
  assert.match(message, /`\/attended` from 7:30 PM until 9:30 PM/);
  assert.match(message, /`\/late date:DD-MM-YYYY`/);
  assert.match(message, /`\/war-admin attendance date:DD-MM-YYYY`/);
  assert.match(message, /<\#war-channel>/);
  assert.match(message, /<@&war-admin-role>/);
  assert.match(message, /Reminders:\*\* 5:00 PM, 6:00 PM, 6:30 PM, 7:00 PM, 7:30 PM, 8:00 PM, 9:00 PM/);
});

test('war info explains setup when the server is not configured', () => {
  assert.match(getWarInfoMessage(), /has not been configured/);
  assert.match(getWarInfoMessage(), /`\/war-admin setup`/);
});
