import { BOT_CONFIG, formatTime, WAR_SCHEDULE_TEXT } from './config.js';

const WEEKDAY_NUMBERS = Object.freeze({
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
});

const manilaFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BOT_CONFIG.timezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function getManilaParts(date = new Date()) {
  const parts = Object.fromEntries(
    manilaFormatter.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    year,
    month,
    day,
    weekday: WEEKDAY_NUMBERS[parts.weekday],
    hour,
    minute,
    second: Number(parts.second),
    minuteOfDay: hour * 60 + minute,
  };
}

function parseDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return parsed;
}

export function isWarDate(date) {
  const parsed = parseDate(date);
  return parsed !== null && BOT_CONFIG.warWeekdays.includes(parsed.getUTCDay());
}

export function parseWarDateInput(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  if (!match) return null;

  const [, month, day, year] = match;
  const isoDate = `${year}-${month}-${day}`;
  return isWarDate(isoDate) ? isoDate : null;
}

export function parseUpcomingWarDateInput(value, now = new Date()) {
  const sessionDate = parseWarDateInput(value);
  if (!sessionDate) return null;
  return sessionDate >= getManilaParts(now).date ? sessionDate : null;
}

export function getMostRecentWarDate(now = new Date()) {
  const parts = getManilaParts(now);
  for (let daysAgo = 0; daysAgo < 7; daysAgo += 1) {
    const weekday = (parts.weekday - daysAgo + 7) % 7;
    if (!BOT_CONFIG.warWeekdays.includes(weekday)) continue;

    const date = new Date(
      Date.UTC(parts.year, parts.month - 1, parts.day - daysAgo),
    );
    return [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      String(date.getUTCDate()).padStart(2, '0'),
    ].join('-');
  }
  throw new Error('War schedule has no war weekdays');
}

export function formatWarDate(date) {
  const parsed = parseDate(date);
  if (!parsed) throw new Error(`Invalid date: ${date}`);
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const day = String(parsed.getUTCDate()).padStart(2, '0');
  return `${month}-${day}-${parsed.getUTCFullYear()}`;
}

function addDays(date, count) {
  const parsed = parseDate(date);
  if (!parsed) throw new Error(`Invalid date: ${date}`);
  parsed.setUTCDate(parsed.getUTCDate() + count);
  return [
    parsed.getUTCFullYear(),
    String(parsed.getUTCMonth() + 1).padStart(2, '0'),
    String(parsed.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function getNextWarDate(parts) {
  const isWarDayToday = BOT_CONFIG.warWeekdays.includes(parts.weekday);
  const attendanceHasClosed =
    parts.minuteOfDay >=
    BOT_CONFIG.attendanceEnd.hour * 60 + BOT_CONFIG.attendanceEnd.minute;
  if (isWarDayToday && !attendanceHasClosed) return parts.date;

  for (let offset = 1; offset <= 7; offset += 1) {
    const date = addDays(parts.date, offset);
    if (isWarDate(date)) return date;
  }
  throw new Error('War schedule has no upcoming session');
}

export function getDefaultLateReportDate(now = new Date()) {
  const parts = getManilaParts(now);
  return isWarDate(parts.date) ? parts.date : getNextWarDate(parts);
}

export function getAttendanceStatus(date = new Date()) {
  const parts = getManilaParts(date);
  const isWarDayToday = BOT_CONFIG.warWeekdays.includes(parts.weekday);
  const startMinute =
    BOT_CONFIG.attendanceStart.hour * 60 + BOT_CONFIG.attendanceStart.minute;
  const endMinute = BOT_CONFIG.attendanceEnd.hour * 60 + BOT_CONFIG.attendanceEnd.minute;
  const nextWarDate = getNextWarDate(parts);

  if (!isWarDayToday) return { status: 'not-war-day', parts, nextWarDate };
  if (parts.minuteOfDay < startMinute) {
    return { status: 'too-early', parts, nextWarDate };
  }
  if (parts.minuteOfDay >= endMinute) {
    return { status: 'closed', parts, nextWarDate };
  }
  return { status: 'open', parts, sessionDate: parts.date };
}

export function getAttendanceMessage(status) {
  if (status.status === 'open') {
    return `Attendance was recorded for ${formatWarDate(status.sessionDate)}.`;
  }
  if (status.status === 'not-war-day') {
    return [
      'There is no club war today, so your attendance was not recorded.',
      `The regular schedule is ${WAR_SCHEDULE_TEXT} Manila time.`,
      `The next attendance window is ${formatWarDate(status.nextWarDate)}, from ${formatTime(BOT_CONFIG.attendanceStart)} to ${formatTime(BOT_CONFIG.attendanceEnd)} Manila time.`,
    ].join('\n');
  }
  if (status.status === 'too-early') {
    return `Attendance was not recorded yet. Today's session opens at ${formatTime(BOT_CONFIG.attendanceStart)} Manila time. Please use /attended between ${formatTime(BOT_CONFIG.attendanceStart)} and ${formatTime(BOT_CONFIG.attendanceEnd)}.`;
  }
  return `Attendance was not recorded because today's session closed at ${formatTime(BOT_CONFIG.attendanceEnd)} Manila time. The next attendance window is ${formatWarDate(status.nextWarDate)}, from ${formatTime(BOT_CONFIG.attendanceStart)} to ${formatTime(BOT_CONFIG.attendanceEnd)}.`;
}
