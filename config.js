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
const REGROUP_START = Object.freeze({ hour: 19, minute: 0 });
const REGROUP_END = Object.freeze({ hour: 20, minute: 0 });
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
  `**Attendance:** Members use \`/attended\` from ${formatTime(ATTENDANCE_START)} until ${formatTime(ATTENDANCE_END)} on war nights.\n\n**Late notice:** Use \`/late [date:MM-DD-YYYY]\` to notify admins in advance. The date defaults to today on war days or the next war date otherwise.\n\n**Guild fund:** Use \`/guild-fund view\` to see current EP, Gold, and PHP cash; use \`/guild-fund info\` for all fund commands.\n\n**Admins:** Use \`/war-admin\` for setup, settings, attendance (\`/war-admin attendance [date:MM-DD-YYYY]\`) and the late list (\`/war-admin late [date:MM-DD-YYYY]\`). Both default to today on war days or the latest war date otherwise. Fund updates: \`/war-admin fund ep value:<text>\`, \`/war-admin fund gold value:<text>\`, \`/war-admin fund php value:<text>\`; set the announcement channel with \`/war-admin fund channel channel:<channel>\`.`;

export const BOT_INFO_REMINDER = '**Need help with the bot commands? Use `/war-info`.**';

export const NON_WAR_USAGE_TEXT =
  `**Attendance:** On war days, use \`/attended\` from ${formatTime(ATTENDANCE_START)} until ${formatTime(ATTENDANCE_END)} to record that you joined the war. It helps track participation and your war salary.\n\n**Late notice:** Use \`/late [date:MM-DD-YYYY]\` when you expect to arrive late for a war. This records that you are still joining and helps the guild keep you instead of kicking you offline at 7:40 PM.\n\n**Why use them:** \`/attended\` records participation after you join, while \`/late\` lets the guild know you are coming later.`;

export const REMINDER_IMPORTANT_TEXT =
  `**Club war:** ${formatTime(WAR_START)}–${formatTime(WAR_END)} Manila time.\n\n**Regroup:** ${formatTime(REGROUP_START)}–${formatTime(REGROUP_END)} Manila time.\n\n**Offline guild members will be kicked at 7:40 PM.**\n\n**Running late for a war? Use \`/late\` and optionally choose a date. Without one, it defaults to today if today is a war day, or the next war date.**`;

const reminderDetails = `${REMINDER_IMPORTANT_TEXT}\n\n${BOT_USAGE_TEXT}\n\n${BOT_INFO_REMINDER}`;

export const BOT_CONFIG = Object.freeze({
  timezone: 'Asia/Manila',
  warWeekdays: WAR_WEEKDAYS,
  warDayNames: WAR_DAY_NAMES,
  attendanceStart: ATTENDANCE_START,
  regroupStart: REGROUP_START,
  regroupEnd: REGROUP_END,
  warStart: WAR_START,
  warEnd: WAR_END,
  attendanceEnd: ATTENDANCE_END,
  reminders: Object.freeze([
    Object.freeze({
      key: 'war_day_1700',
      hour: 17,
      minute: 0,
      message: `@everyone **Club war is tonight at ${formatTime(WAR_START)}—gear up, squad up, and get ready for the W!**\n\n${reminderDetails}`,
      everyone: true,
    }),
    Object.freeze({
      key: 'war_day_1800',
      hour: 18,
      minute: 0,
      message: `@everyone **Club war is tonight at ${formatTime(WAR_START)}—charge up, check your loadout, and prepare for the raid!**\n\n${reminderDetails}`,
      everyone: true,
    }),
    Object.freeze({
      key: 'regroup_1830',
      hour: 18,
      minute: 30,
      message: `@everyone **Club war:** ${formatTime(WAR_START)}–${formatTime(WAR_END)} Manila time. **Regroup starts at ${formatTime(REGROUP_START)}—get squad-ready!**\n\n${reminderDetails}`,
      everyone: true,
    }),
    Object.freeze({
      key: 'regroup_1900',
      hour: 19,
      minute: 0,
      message: `@everyone **Regroup starts now: ${formatTime(REGROUP_START)}–${formatTime(REGROUP_END)} Manila time. Squad up and get ready—club war starts at ${formatTime(WAR_START)}!**\n\n${reminderDetails}`,
      everyone: true,
    }),
    Object.freeze({
      key: 'regroup_1930',
      hour: 19,
      minute: 30,
      message: `@everyone **Members can now use \`/attended\` to record their attendance for the war. Regroup continues until club war starts at ${formatTime(WAR_START)}. Attendance is open from ${formatTime(ATTENDANCE_START)} until ${formatTime(ATTENDANCE_END)}.**\n\n${reminderDetails}`,
      everyone: true,
    }),
    Object.freeze({
      key: 'late_kick_1940',
      hour: 19,
      minute: 40,
      message: `@everyone **Offline kick now. Late-notice members stay. Once you join, use \`/attended\` to record your attendance.**\n\n${BOT_INFO_REMINDER}`,
      everyone: true,
    }),
    Object.freeze({
      key: 'war_start_2000',
      hour: WAR_START.hour,
      minute: WAR_START.minute,
      message: `@everyone **GLHF, everyone! Club war starts now—lock in and let's get that W!**\n\n**If you haven't used \`/attended\` yet, check in by ${formatTime(ATTENDANCE_END)} Manila time. No check-in means no salary for this war!**\n\n${BOT_INFO_REMINDER}`,
      everyone: true,
    }),
    Object.freeze({
      key: 'war_end_2100',
      hour: WAR_END.hour,
      minute: WAR_END.minute,
      message: `@everyone **GG, everyone! Club war is over—good run, squad!**\n\n**You have 30 minutes left to use \`/attended\` and be recorded for this war. Attendance closes at ${formatTime(ATTENDANCE_END)} Manila time. No check-in means no salary for this war!**\n\n${BOT_INFO_REMINDER}`,
      everyone: true,
    }),
  ]),
  nonWarDayReminder: Object.freeze({
    key: 'non_war_day_schedule',
    hour: 19,
    minute: 0,
    message: `@everyone **No club war is scheduled for tonight.** The weekly schedule is ${warScheduleText} Manila time.\n\n${NON_WAR_USAGE_TEXT}\n\n${BOT_INFO_REMINDER}`,
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
    `**Regroup:** ${formatTime(BOT_CONFIG.regroupStart)}–${formatTime(BOT_CONFIG.regroupEnd)} Manila time; offline guild members are kicked at 7:40 PM.`,
    `**Attendance:** Use \`/attended\` from ${formatTime(BOT_CONFIG.attendanceStart)} until ${formatTime(BOT_CONFIG.attendanceEnd)} on war days.`,
    '**Late notice:** Use `/late [date:MM-DD-YYYY]` to report you will be late. The date defaults to today on war days or the next war date otherwise.',
    `**Reminders:** ${reminders} on war days; 7:00 PM on non-war days.`,
    '',
    '**Admin commands** (authorized admin role):',
    '`/war-admin setup war_channel:<channel> fund_channel:<channel> admin_role:<role>` — configure war reminders, fund announcements, and the initial admin role.',
    '`/war-admin settings` — view current bot settings.',
    '`/war-admin role-add` / `/war-admin role-remove` — manage authorized roles.',
    '`/war-admin fund ep value:<text>` — update the guild EP balance.',
    '`/war-admin fund gold value:<text>` — update the guild Gold balance.',
    '`/war-admin fund php value:<text>` — update the guild PHP cash balance.',
    '`/war-admin fund channel channel:<channel>` — set where fund updates are announced with `@everyone`.',
    '`/guild-fund view` — show current EP, Gold, and PHP cash fund values.',
    '`/guild-fund info` — show all public and admin guild fund commands.',
    '`/war-admin attendance [date:MM-DD-YYYY]` — view session attendance; defaults to the latest war date.',
    '`/war-admin late [date:MM-DD-YYYY]` — view late notices; defaults to the latest war date.',
    '`/war-admin add-attendance member date:MM-DD-YYYY` — add attendance manually.',
    '`/guild-fund` — view current EP, Gold, and PHP cash fund balances.',
    '',
    '**Current server configuration**',
    serverConfiguration,
  ].join('\n');
}
