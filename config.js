const WEEKDAY_NAMES = Object.freeze([
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]);

const WAR_WEEKDAYS = Object.freeze([1, 3, 6]);
const ATTENDANCE_START = Object.freeze({ hour: 19, minute: 30 });
const WAR_START = Object.freeze({ hour: 20, minute: 0 });
const WAR_END = Object.freeze({ hour: 21, minute: 0 });
const ATTENDANCE_END = Object.freeze({ hour: 21, minute: 30 });
const WAR_DAY_NAMES = Object.freeze(WAR_WEEKDAYS.map((weekday) => WEEKDAY_NAMES[weekday]));
const warDaysText =
  WAR_DAY_NAMES.length > 1
    ? `${WAR_DAY_NAMES.slice(0, -1).join(', ')}, and ${WAR_DAY_NAMES.at(-1)}`
    : WAR_DAY_NAMES[0];
const warScheduleText = `${warDaysText}, ${formatTime(WAR_START)}–${formatTime(WAR_END)}`;

export function formatTime({ hour, minute }) {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
}

export const BOT_USAGE_TEXT =
  `**Attendance:** Members use /attended from ${formatTime(ATTENDANCE_START)} until ${formatTime(ATTENDANCE_END)} on war nights.\n\n**Late notice:** Use /late date:MM-DD-YYYY to notify admins in advance.\n\n**Admins:** Use /war-admin for setup, settings, attendance, and the late list (/war-admin late date:MM-DD-YYYY).`;

export const BOT_INFO_REMINDER = '**Need help with the bot commands? Use /war-info.**';

export const REMINDER_IMPORTANT_TEXT =
  `**Club war:** ${formatTime(WAR_START)}–${formatTime(WAR_END)} Manila time.\n\n**Regroup:** ${formatTime(ATTENDANCE_START)}.\n\n**Offline guild members will be kicked at 7:40 PM.**\n\n**Running late for a war? Use /late and select the war date to notify admins.**`;

const reminderDetails = `${REMINDER_IMPORTANT_TEXT}\n\n${BOT_USAGE_TEXT}\n\n${BOT_INFO_REMINDER}`;

export const BOT_CONFIG = Object.freeze({
  timezone: 'Asia/Manila',
  warWeekdays: WAR_WEEKDAYS,
  warDayNames: WAR_DAY_NAMES,
  attendanceStart: ATTENDANCE_START,
  warStart: WAR_START,
  warEnd: WAR_END,
  attendanceEnd: ATTENDANCE_END,
  reminders: Object.freeze([
    Object.freeze({
      key: 'war_day_1700',
      hour: 17,
      minute: 0,
      message: `@everyone **Club war is tonight at ${formatTime(WAR_START)}—please start getting ready!**\n\n${reminderDetails}`,
      everyone: true,
    }),
    Object.freeze({
      key: 'war_day_1800',
      hour: 18,
      minute: 0,
      message: `@everyone **Club war is tonight at ${formatTime(WAR_START)}—start getting ready!**\n\n${reminderDetails}`,
      everyone: true,
    }),
    Object.freeze({
      key: 'regroup_1830',
      hour: 18,
      minute: 30,
      message: `@everyone **Club war:** ${formatTime(WAR_START)}–${formatTime(WAR_END)} Manila time. **Regroup at ${formatTime(ATTENDANCE_START)}.**\n\n${reminderDetails}`,
      everyone: true,
    }),
    Object.freeze({
      key: 'regroup_1900',
      hour: 19,
      minute: 0,
      message: `@everyone **Club war starts at ${formatTime(WAR_START)}. Please regroup at ${formatTime(ATTENDANCE_START)}!**\n\n${reminderDetails}`,
      everyone: true,
    }),
    Object.freeze({
      key: 'regroup_1930',
      hour: 19,
      minute: 30,
      message: `@everyone **Regroup now! Attendance is open from ${formatTime(ATTENDANCE_START)} until ${formatTime(ATTENDANCE_END)}.**\n\n${reminderDetails}`,
      everyone: true,
    }),
    Object.freeze({
      key: 'war_start_2000',
      hour: WAR_START.hour,
      minute: WAR_START.minute,
      message: `@everyone **GLHF, everyone! Club war starts now—let's get that win!**\n\n**If you haven't used /attended yet, check in by ${formatTime(ATTENDANCE_END)} Manila time. No check-in means no salary for this war!**\n\n${BOT_INFO_REMINDER}`,
      everyone: true,
    }),
    Object.freeze({
      key: 'war_end_2100',
      hour: WAR_END.hour,
      minute: WAR_END.minute,
      message: `@everyone **GG, everyone! Club war is over!**\n\n**If you haven't used /attended yet, check in by ${formatTime(ATTENDANCE_END)} Manila time. No check-in means no salary for this war!**\n\n${BOT_INFO_REMINDER}`,
      everyone: true,
    }),
  ]),
  nonWarDayReminder: Object.freeze({
    key: 'non_war_day_schedule',
    hour: 19,
    minute: 30,
    message: `@everyone **No club war is scheduled for tonight.** The weekly schedule is ${warScheduleText} Manila time.\n\n${reminderDetails}`,
  }),
});

export const WAR_SCHEDULE_TEXT = warScheduleText;

export function getWarInfoMessage(settings) {
  const reminders = BOT_CONFIG.reminders
    .map(({ hour, minute }) => formatTime({ hour, minute }))
    .join(', ');
  const serverConfiguration = settings
    ? [
        `**Reminder channel:** <#${settings.channelId}>`,
        `**Admin roles:** ${settings.adminRoleIds.map((roleId) => `<@&${roleId}>`).join(', ') || 'None'}`,
      ].join('\n')
    : 'This bot has not been configured in this server yet. A server manager can run `/war-admin setup`.';

  return [
    '**Club War Information**',
    `**Schedule:** ${WAR_SCHEDULE_TEXT} ${BOT_CONFIG.timezone}`,
    '**Commands:** All commands can be used in any server channel. Scheduled reminders are sent to the configured reminder channel.',
    `**Regroup:** ${formatTime(BOT_CONFIG.attendanceStart)}; offline guild members are kicked at 7:40 PM.`,
    `**Attendance:** Use \`/attended\` from ${formatTime(BOT_CONFIG.attendanceStart)} until ${formatTime(BOT_CONFIG.attendanceEnd)} on war days.`,
    '**Late notice:** Use `/late date:MM-DD-YYYY` to report you will be late for today’s or a future war.',
    `**Reminders:** ${reminders} on war days; 7:30 PM on non-war days.`,
    '',
    '**Admin commands** (authorized admin role):',
    '`/war-admin setup` — configure the channel and initial admin role.',
    '`/war-admin settings` — view current bot settings.',
    '`/war-admin role-add` / `/war-admin role-remove` — manage authorized roles.',
    '`/war-admin attendance date:MM-DD-YYYY` — view session attendance.',
    '`/war-admin late date:MM-DD-YYYY` — view late notices for a scheduled war.',
    '`/war-admin add-attendance member date:MM-DD-YYYY` — add attendance manually.',
    '',
    '**Current server configuration**',
    serverConfiguration,
  ].join('\n');
}
