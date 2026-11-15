import {
  BOT_CONFIG,
  BOT_INFO_REMINDER,
  BOT_USAGE_TEXT,
  REMINDER_IMPORTANT_TEXT,
  formatTime,
} from './config.js';
import { getManilaParts } from './schedule.js';
import { readData, updateData } from './store.js';
import { DiscordRequest } from './utils.js';

const ROSTER_COLUMN_COUNT = 4;
const ROSTER_TABLE_HEADER = `${'| # | Member '.repeat(ROSTER_COLUMN_COUNT)}|\n${'|---:|---'.repeat(ROSTER_COLUMN_COUNT)}|`;
const MAX_ROSTER_MESSAGE_LENGTH = 1800;

export function getScheduledEvents(parts) {
  const isWarDay = BOT_CONFIG.warWeekdays.includes(parts.weekday);
  const events = [
    ...(isWarDay
      ? [
          ...BOT_CONFIG.reminders,
          {
            key: 'attendance_closed',
            hour: BOT_CONFIG.attendanceEnd.hour,
            minute: BOT_CONFIG.attendanceEnd.minute,
            message: `@everyone **Attendance is now closed.** The war ran from ${formatTime(BOT_CONFIG.warStart)} to ${formatTime(BOT_CONFIG.warEnd)} Manila time.\n\n${REMINDER_IMPORTANT_TEXT}\n\n${BOT_USAGE_TEXT}\n\n${BOT_INFO_REMINDER}`,
            everyone: true,
          },
          {
            key: 'attendance_roster',
            hour: BOT_CONFIG.attendanceEnd.hour,
            minute: BOT_CONFIG.attendanceEnd.minute,
            roster: true,
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

export function formatAttendanceRosterMessages(date, records) {
  const title = `Attendance for ${date}:`;
  if (records.length === 0) {
    return [`${title}\n${ROSTER_TABLE_HEADER}\n| - | No attendance recorded for this session. |  |  |  |  |  |  |`];
  }

  const rows = [];
  for (let index = 0; index < records.length; index += ROSTER_COLUMN_COUNT) {
    const cells = records.slice(index, index + ROSTER_COLUMN_COUNT).flatMap((record, offset) => [
      String(index + offset + 1),
      record.displayName.replace(/[\r\n]/g, ' ').replace(/\|/g, '\\|'),
    ]);
    while (cells.length < ROSTER_COLUMN_COUNT * 2) cells.push('');
    rows.push(`| ${cells.join(' | ')} |`);
  }

  const chunks = [];
  const header = `${title}\n${ROSTER_TABLE_HEADER}`;
  let message = header;

  for (const row of rows) {
    const nextMessage = `${message}\n${row}`;
    if (nextMessage.length > MAX_ROSTER_MESSAGE_LENGTH && message !== header) {
      chunks.push(message);
      message = `${title} (continued)\n${ROSTER_TABLE_HEADER}\n${row}`;
    } else {
      message = nextMessage;
    }
  }
  chunks.push(message);
  return chunks;
}

async function postEvent(guildId, channelId, date, event) {
  if (event.roster) {
    const data = await readData();
    const records = data.attendance
      .filter((record) => record.guildId === guildId && record.sessionDate === date)
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
    for (const content of formatAttendanceRosterMessages(date, records)) {
      await DiscordRequest(`channels/${channelId}/messages`, {
        method: 'POST',
        body: { content, allowed_mentions: { parse: [] } },
      });
    }
    return;
  }

  await DiscordRequest(`channels/${channelId}/messages`, {
    method: 'POST',
    body: {
      content: event.message,
      allowed_mentions: { parse: event.everyone ? ['everyone'] : [] },
    },
  });
}

export async function runSchedulerTick(now = new Date()) {
  const parts = getManilaParts(now);
  const events = getScheduledEvents(parts);
  if (events.length === 0) return;

  const data = await readData();
  for (const [guildId, settings] of Object.entries(data.guilds)) {
    if (!settings.channelId) continue;

    for (const event of events) {
      const eventKey = `${guildId}:${parts.date}:${event.key}`;
      if (data.announcements.includes(eventKey)) continue;
      try {
        await postEvent(guildId, settings.channelId, parts.date, event);
        await updateData((latest) => {
          if (!latest.announcements.includes(eventKey)) {
            latest.announcements.push(eventKey);
          }
        });
        data.announcements.push(eventKey);
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
