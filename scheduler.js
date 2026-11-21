import {
  BOT_CONFIG,
  BOT_INFO_REMINDER,
  BOT_USAGE_TEXT,
  REMINDER_IMPORTANT_TEXT,
  formatTime,
} from './config.js';
import { formatWarDate, getManilaParts } from './schedule.js';
import { readData, updateData } from './store.js';
import {
  formatAttendanceListMessages,
  formatLateListMessages,
} from './attendance-lists.js';
import { DiscordRequest } from './utils.js';
import {
  getTopupReferralCallout,
  getTopupReferralReminderMessage,
} from './topup-reminder.js';

export function getScheduledEvents(parts) {
  const isWarDay = BOT_CONFIG.warWeekdays.includes(parts.weekday);
  const events = [
    BOT_CONFIG.topupReminder,
    ...(isWarDay
      ? [
          ...BOT_CONFIG.reminders,
          {
            key: 'late_roster_1940',
            hour: 19,
            minute: 40,
            lateRoster: true,
            rosterTitle: `Members who reported late for ${formatWarDate(parts.date)}:`,
          },
          {
            key: 'attendance_roster_2100',
            hour: BOT_CONFIG.warEnd.hour,
            minute: BOT_CONFIG.warEnd.minute,
            roster: true,
            rosterTitle: `Attendance recorded so far for ${formatWarDate(parts.date)}:`,
          },
          {
            key: 'attendance_roster_2115',
            hour: 21,
            minute: 15,
            roster: true,
            rosterTitle: `Attendance recorded so far for ${formatWarDate(parts.date)}:`,
          },
          {
            key: 'attendance_closed',
            hour: BOT_CONFIG.attendanceEnd.hour,
            minute: BOT_CONFIG.attendanceEnd.minute,
            message: `@everyone **Attendance is now closed. GG to the squad—participation is locked!** The war ran from ${formatTime(BOT_CONFIG.warStart)} to ${formatTime(BOT_CONFIG.warEnd)} Manila time.\n\n${REMINDER_IMPORTANT_TEXT}\n\n${BOT_USAGE_TEXT}\n\n${BOT_INFO_REMINDER}`,
            everyone: true,
          },
          {
            key: 'attendance_roster',
            hour: BOT_CONFIG.attendanceEnd.hour,
            minute: BOT_CONFIG.attendanceEnd.minute,
            roster: true,
            rosterTitle: `Final attendance for ${formatWarDate(parts.date)}:`,
          },
        ]
      : [
          {
            ...BOT_CONFIG.nonWarDayReminder,
            everyone: true,
          },
        ]),
  ];

  return events.filter((event) => {
    const eventMinute = event.hour * 60 + event.minute;
    return parts.minuteOfDay >= eventMinute && parts.minuteOfDay < eventMinute + 1;
  });
}

export function formatAttendanceRosterMessages(
  date,
  records,
  title = `Attendance for ${formatWarDate(date)}:`,
) {
  return formatAttendanceListMessages(
    date,
    records,
    title,
    'No attendance recorded for this session.',
  );
}

async function postEvent(guildId, channelId, date, event, discordRequest, read) {
  if (event.topupReferral) {
    await discordRequest(`channels/${channelId}/messages`, {
      method: 'POST',
      body: {
        content: getTopupReferralReminderMessage(event.referralCode),
        allowed_mentions: { parse: ['everyone'] },
      },
    });
    return;
  }

  if (event.lateRoster) {
    const data = await read();
    const lateReports = data.lateReports.filter(
      (record) => record.guildId === guildId && record.sessionDate === date,
    );
    for (const content of formatLateListMessages(
      date,
      lateReports,
      event.rosterTitle,
    )) {
      await discordRequest(`channels/${channelId}/messages`, {
        method: 'POST',
        body: { content, allowed_mentions: { parse: [] } },
      });
    }
    return;
  }

  if (event.roster) {
    const data = await read();
    const records = data.attendance
      .filter((record) => record.guildId === guildId && record.sessionDate === date);
    for (const content of formatAttendanceRosterMessages(
      date,
      records,
      event.rosterTitle,
    )) {
      await discordRequest(`channels/${channelId}/messages`, {
        method: 'POST',
        body: { content, allowed_mentions: { parse: [] } },
      });
    }
    return;
  }

  await discordRequest(`channels/${channelId}/messages`, {
    method: 'POST',
    body: {
      content: event.message,
      allowed_mentions: { parse: event.everyone ? ['everyone'] : [] },
    },
  });
}

export async function runSchedulerTick(
  now = new Date(),
  { read = readData, update = updateData, request = DiscordRequest } = {},
) {
  const parts = getManilaParts(now);
  const events = getScheduledEvents(parts);
  if (events.length === 0) return;

  const data = await read();
  for (const [guildId, settings] of Object.entries(data.guilds)) {
    if (!settings.channelId) continue;

    const topup = settings.topup;
    const topupEnabled =
      topup?.enabled !== false &&
      typeof topup?.code === 'string' &&
      topup.code.trim().length > 0 &&
      typeof topup?.channelId === 'string' &&
      topup.channelId.length > 0;
    const guildEvents = events.flatMap((event) => {
      if (event.topupReferral) {
        return topupEnabled
          ? [{ ...event, referralCode: topup.code, targetChannelId: topup.channelId }]
          : [];
      }
      if (
        event.key === BOT_CONFIG.nonWarDayReminder.key &&
        topupEnabled
      ) {
        return [{
          ...event,
          message: event.message.replace(
            `\n\n${BOT_INFO_REMINDER}`,
            `\n\n${getTopupReferralCallout(topup.code)}\n\n${BOT_INFO_REMINDER}`,
          ),
        }];
      }
      return [event];
    });

    for (const event of guildEvents) {
      const eventKey = `${guildId}:${parts.date}:${event.key}`;
      if (data.announcements.includes(eventKey)) continue;
      try {
        await postEvent(
          guildId,
          event.targetChannelId ?? settings.channelId,
          parts.date,
          event,
          request,
          read,
        );
        await update((latest) => {
          if (!latest.announcements.includes(eventKey)) {
            latest.announcements.push(eventKey);
          }
        });
        if (!data.announcements.includes(eventKey)) {
          data.announcements.push(eventKey);
        }
      } catch (error) {
        console.error(`Failed to send ${event.key} announcement for guild ${guildId}:`, error);
      }
    }
  }
}

export function startScheduler() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runSchedulerTick();
    } catch (error) {
      console.error('Scheduler tick failed:', error);
    } finally {
      running = false;
    }
  };
  void tick();
  const interval = setInterval(tick, 10_000);
  interval.unref();
  return interval;
}
