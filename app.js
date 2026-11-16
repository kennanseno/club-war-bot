import 'dotenv/config';
import express from 'express';
import {
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  verifyKeyMiddleware,
} from 'discord-interactions';
import {
  addAttendanceManually,
  recordAttendance,
  recordLateReport,
} from './attendance.js';
import {
  BOT_CONFIG,
  formatTime,
  getWarInfoMessage,
  WAR_SCHEDULE_TEXT,
} from './config.js';
import {
  getAttendanceMessage,
  getAttendanceStatus,
  formatWarDate,
  getMostRecentWarDate,
  parseUpcomingWarDateInput,
  parseWarDateInput,
} from './schedule.js';
import {
  formatAttendanceListMessages,
  formatLateListMessages,
} from './attendance-lists.js';
import { readData, updateData } from './store.js';
import { startScheduler } from './scheduler.js';
import { DiscordRequest } from './utils.js';
import { readGuildFundData, updateGuildFundData } from './guild-fund-store.js';
import {
  formatGuildFundInfoMessage,
  formatGuildFundMessage,
  getGuildFundAnnouncement,
  migrateLegacyGuildFunds,
  updateGuildFund,
} from './guild-fund.js';

for (const variable of ['APP_ID', 'DISCORD_TOKEN', 'PUBLIC_KEY']) {
  if (!process.env[variable]) {
    throw new Error(`${variable} is required to run the Discord bot.`);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;
const EPHEMERAL = InteractionResponseFlags.EPHEMERAL;
const MANAGE_GUILD = 1n << 5n;

function getOption(options, name) {
  return options?.find((option) => option.name === name)?.value;
}

function getSubcommand(data) {
  const subcommand = data.options?.[0];
  if (subcommand?.type === 2) {
    const nestedSubcommand = subcommand.options?.[0];
    return {
      group: subcommand.name,
      name: nestedSubcommand?.name,
      options: nestedSubcommand?.options ?? [],
    };
  }
  return {
    group: undefined,
    name: subcommand?.name,
    options: subcommand?.options ?? [],
  };
}

function getMemberName(interactionMember, user) {
  return (
    interactionMember?.nick ||
    interactionMember?.user?.global_name ||
    interactionMember?.user?.username ||
    user?.global_name ||
    user?.username ||
    'Unknown member'
  );
}

function getUserId(body) {
  return body.member?.user?.id ?? body.user?.id;
}

function getUserName(body) {
  return getMemberName(body.member, body.user);
}

function response(res, content, ephemeral = false) {
  return res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content,
      ...(ephemeral ? { flags: EPHEMERAL } : {}),
      allowed_mentions: { parse: [] },
    },
  });
}

function hasManageGuildPermission(body) {
  try {
    return (BigInt(body.member?.permissions ?? '0') & MANAGE_GUILD) === MANAGE_GUILD;
  } catch {
    return false;
  }
}

function isAuthorizedAdmin(body, settings) {
  const memberRoles = body.member?.roles ?? [];
  return settings?.adminRoleIds?.some((roleId) => memberRoles.includes(roleId)) ?? false;
}

function requireGuild(body, res) {
  if (!body.guild_id || !body.channel_id) {
    response(res, 'This command can only be used in a server channel.', true);
    return false;
  }
  return true;
}

async function sendAdminMessages(res, body, messages) {
  response(res, messages[0], true);
  for (const content of messages.slice(1)) {
    await DiscordRequest(`webhooks/${process.env.APP_ID}/${body.token}`, {
      method: 'POST',
      body: {
        content,
        flags: EPHEMERAL,
        allowed_mentions: { parse: [] },
      },
    });
  }
}

async function sendEphemeralList(res, body, confirmation, messages) {
  response(res, `${confirmation}\n\n${messages[0]}`, true);
  for (const content of messages.slice(1)) {
    await DiscordRequest(`webhooks/${process.env.APP_ID}/${body.token}`, {
      method: 'POST',
      body: {
        content,
        flags: EPHEMERAL,
        allowed_mentions: { parse: [] },
      },
    });
  }
}

async function sendEphemeralFollowup(body, content) {
  await DiscordRequest(`webhooks/${process.env.APP_ID}/${body.token}`, {
    method: 'POST',
    body: {
      content,
      flags: EPHEMERAL,
      allowed_mentions: { parse: [] },
    },
  });
}

async function sendAdminList(res, body, sessionDate, attendance) {
  return sendAdminMessages(
    res,
    body,
    formatAttendanceListMessages(sessionDate, attendance),
  );
}

async function handleAttended(body, res) {
  if (!requireGuild(body, res)) return;
  const status = getAttendanceStatus();
  if (status.status !== 'open') {
    return response(res, getAttendanceMessage(status), true);
  }

  const guildId = body.guild_id;
  const userId = getUserId(body);
  const displayName = getUserName(body);
  if (!userId) {
    return response(res, 'I could not identify your server account, so attendance was not recorded.', true);
  }

  const result = await recordAttendance(updateData, {
    guildId,
    sessionDate: status.sessionDate,
    userId,
    displayName,
  });

  const current = await readData();
  const attendance = current.attendance
    .filter(
      (record) =>
        record.guildId === guildId && record.sessionDate === status.sessionDate,
    );
  return sendEphemeralList(
    res,
    body,
    result === 'duplicate'
      ? `Your attendance for ${formatWarDate(status.sessionDate)} is already recorded.`
      : getAttendanceMessage(status),
    formatAttendanceListMessages(status.sessionDate, attendance),
  );
}

async function handleLate(body, res) {
  if (!requireGuild(body, res)) return;
  const sessionDate = parseUpcomingWarDateInput(getOption(body.data.options, 'date'));
  if (!sessionDate) {
    return response(
      res,
      'Choose today or a future Monday, Wednesday, or Saturday war date in MM-DD-YYYY format. Past dates and non-war dates are not accepted.',
      true,
    );
  }

  const userId = getUserId(body);
  if (!userId) {
    return response(res, 'I could not identify your server account, so your late notice was not recorded.', true);
  }

  const result = await recordLateReport(updateData, {
    guildId: body.guild_id,
    sessionDate,
    userId,
    displayName: getUserName(body),
  });
  const current = await readData();
  const lateReports = current.lateReports
    .filter(
      (record) =>
        record.guildId === body.guild_id && record.sessionDate === sessionDate,
    );
  return sendEphemeralList(
    res,
    body,
    result === 'duplicate'
      ? `Your late notice for ${formatWarDate(sessionDate)} is already recorded. An admin can view it with /war-admin late date:${getOption(body.data.options, 'date')}.`
      : `Your late notice for the ${formatWarDate(sessionDate)} war is recorded. An admin can view it with /war-admin late date:${getOption(body.data.options, 'date')}.`,
    formatLateListMessages(sessionDate, lateReports),
  );
}

async function handleAdmin(body, res, data) {
  if (!requireGuild(body, res)) return;
  const { group, name: subcommand, options } = getSubcommand(data);
  const guildId = body.guild_id;
  const actorId = getUserId(body);
  const current = await readData();
  const settings = current.guilds[guildId];
  const isBootstrapAdmin = hasManageGuildPermission(body);

  if (subcommand !== 'setup' && !isAuthorizedAdmin(body, settings)) {
    return response(res, 'You need an authorized admin role to use this command.', true);
  }
  if (subcommand === 'setup' && !isBootstrapAdmin && !isAuthorizedAdmin(body, settings)) {
    return response(res, 'Initial setup requires the Manage Server permission. After setup, authorized roles can manage the bot.', true);
  }
  if (subcommand === 'setup') {
    const adminRoleId = getOption(options, 'admin_role');
    await updateData((store) => {
      const previous = store.guilds[guildId];
      store.guilds[guildId] = {
        ...previous,
        channelId: body.channel_id,
        adminRoleIds: [adminRoleId],
        updatedAt: new Date().toISOString(),
        updatedBy: actorId,
      };
      if (previous?.adminRoleIds?.includes(adminRoleId)) {
        store.guilds[guildId].adminRoleIds = previous.adminRoleIds;
      }
    });
    return response(
      res,
      `Setup complete. Commands can be used in any server channel. Scheduled reminders will be sent in <#${body.channel_id}>. <@&${adminRoleId}> can manage bot settings and attendance. Use /war-admin settings to review the configuration.`,
      true,
    );
  }

  if (!settings) {
    return response(res, 'The bot has not been configured yet. Ask a server manager to run /war-admin setup.', true);
  }

  if (group === 'fund') {
    if (subcommand === 'channel') {
      const channelId = getOption(options, 'channel');
      const fund = await updateGuildFund(updateGuildFundData, guildId, { channelId });
      return response(
        res,
        `Guild fund announcements will be sent to <#${fund.channelId}>.`,
        true,
      );
    }

    if (subcommand === 'ep' || subcommand === 'gold' || subcommand === 'php') {
      const value = getOption(options, 'value');
      const fund = await updateGuildFund(updateGuildFundData, guildId, {
        [subcommand]: value,
      });
      if (!fund.channelId) {
        return response(
          res,
          `${subcommand === 'ep' ? 'EP' : subcommand === 'gold' ? 'Gold' : 'PHP cash'} fund updated. Set an announcement channel with /war-admin fund channel to notify everyone.`,
          true,
        );
      }

      response(
        res,
        `Fund updated. Sending the latest values to <#${fund.channelId}>.`,
        true,
      );
      try {
        await DiscordRequest(`channels/${fund.channelId}/messages`, {
          method: 'POST',
          body: getGuildFundAnnouncement(fund),
        });
      } catch (error) {
        console.error(`Guild fund updated, but announcement failed for guild ${guildId}:`, error);
        try {
          await sendEphemeralFollowup(
            body,
            `The fund was updated, but the announcement could not be sent to <#${fund.channelId}>. Check the bot's channel permissions.`,
          );
        } catch (followupError) {
          console.error(`Could not report guild fund announcement failure for guild ${guildId}:`, followupError);
        }
      }
      return;
    }
  }

  if (subcommand === 'settings') {
    const roles = settings.adminRoleIds.map((roleId) => `<@&${roleId}>`).join(', ') || 'None';
    const fund = (await readGuildFundData()).guildFunds[guildId] ?? {};
    return response(
      res,
      `**Club war bot settings**\nReminder channel: <#${settings.channelId}>\nAdmin roles: ${roles}\nSchedule: ${WAR_SCHEDULE_TEXT} ${BOT_CONFIG.timezone}\nAttendance: ${formatTime(BOT_CONFIG.attendanceStart)}–${formatTime(BOT_CONFIG.attendanceEnd)} ${BOT_CONFIG.timezone}\nFund announcement channel: ${fund.channelId ? `<#${fund.channelId}>` : 'Not set'}\nEP fund: ${fund.ep ?? 'Not set'}\nGold fund: ${fund.gold ?? 'Not set'}\nPHP cash fund: ${fund.php ?? 'Not set'}`,
      true,
    );
  }

  if (subcommand === 'role-add' || subcommand === 'role-remove') {
    const roleId = getOption(options, 'role');
    const added = subcommand === 'role-add';
    const change = await updateData((store) => {
      const guildSettings = store.guilds[guildId];
      const hadRole = guildSettings.adminRoleIds.includes(roleId);
      if (added && !hadRole) guildSettings.adminRoleIds.push(roleId);
      if (!added && hadRole) {
        guildSettings.adminRoleIds = guildSettings.adminRoleIds.filter((id) => id !== roleId);
      }
      guildSettings.updatedAt = new Date().toISOString();
      guildSettings.updatedBy = actorId;
      return hadRole;
    });
    return response(
      res,
      change
        ? added
          ? `<@&${roleId}> is already authorized.`
          : `<@&${roleId}> was removed from the admin role list.`
        : added
          ? `<@&${roleId}> can now manage bot settings and attendance.`
          : `<@&${roleId}> was not in the admin role list.`,
      true,
    );
  }

  if (subcommand === 'attendance') {
    const dateInput = getOption(options, 'date');
    const sessionDate = dateInput === undefined
      ? getMostRecentWarDate()
      : parseWarDateInput(dateInput);
    if (!sessionDate) {
      return response(res, 'That is not a valid scheduled war date. Enter a real Monday, Wednesday, or Saturday date in MM-DD-YYYY format, for example 11-16-2026.', true);
    }
    const attendance = current.attendance
      .filter((record) => record.guildId === guildId && record.sessionDate === sessionDate);
    return sendAdminList(res, body, sessionDate, attendance);
  }

  if (subcommand === 'late') {
    const dateInput = getOption(options, 'date');
    const sessionDate = dateInput === undefined
      ? getMostRecentWarDate()
      : parseWarDateInput(dateInput);
    if (!sessionDate) {
      return response(
        res,
        'Enter a real Monday, Wednesday, or Saturday war date in MM-DD-YYYY format, for example 11-16-2026.',
        true,
      );
    }
    const lateReports = current.lateReports
      .filter((record) => record.guildId === guildId && record.sessionDate === sessionDate);
    return sendAdminMessages(
      res,
      body,
      formatLateListMessages(sessionDate, lateReports),
    );
  }

  if (subcommand === 'add-attendance') {
    const sessionDate = parseWarDateInput(getOption(options, 'date'));
    const memberId = getOption(options, 'member');
    if (!sessionDate) {
      return response(res, 'That is not a valid scheduled war date. Enter a real Monday, Wednesday, or Saturday date in MM-DD-YYYY format, for example 11-16-2026.', true);
    }
    const resolvedUser = body.data.resolved?.users?.[memberId];
    const resolvedMember = body.data.resolved?.members?.[memberId];
    if (!resolvedUser) {
      return response(res, 'I could not resolve that server member, so attendance was not changed.', true);
    }
    const displayName = getMemberName(
      { ...resolvedMember, user: resolvedUser },
      resolvedUser,
    );
    const result = await addAttendanceManually(updateData, {
      guildId,
      sessionDate,
      userId: memberId,
      displayName,
      addedBy: actorId,
    });
    return response(
      res,
      result === 'duplicate'
        ? `${displayName} is already recorded for ${formatWarDate(sessionDate)}; no duplicate was added.`
        : `Recorded ${displayName} as attending the ${formatWarDate(sessionDate)} session. Added by <@${actorId}>.`,
      true,
    );
  }

  return response(res, 'Unknown admin command.', true);
}

app.post(
  '/interactions',
  verifyKeyMiddleware(process.env.PUBLIC_KEY),
  async (req, res) => {
    const { type, data } = req.body;
    if (type === InteractionType.PING) {
      return res.send({ type: InteractionResponseType.PONG });
    }
    if (type !== InteractionType.APPLICATION_COMMAND) {
      return res.status(400).json({ error: 'unsupported interaction type' });
    }

    try {
      if (data.name === 'attended') return await handleAttended(req.body, res);
      if (data.name === 'late') return await handleLate(req.body, res);
      if (data.name === 'war-info') {
        if (!requireGuild(req.body, res)) return;
        const current = await readData();
        return response(res, getWarInfoMessage(current.guilds[req.body.guild_id]));
      }
      if (data.name === 'guild-fund') {
        if (!requireGuild(req.body, res)) return;
        if (data.options?.some((option) => option.name === 'info')) {
          return response(res, formatGuildFundInfoMessage());
        }
        const current = await readGuildFundData();
        return response(res, formatGuildFundMessage(current.guildFunds[req.body.guild_id]));
      }
      if (data.name === 'war-admin') return await handleAdmin(req.body, res, data);
      return response(res, `Unknown command: ${data.name}`, true);
    } catch (error) {
      console.error(`Interaction ${data.name} failed:`, error);
      if (res.headersSent) return;
      return response(
        res,
        data.name === 'attended'
          ? 'Attendance was not recorded because saving it failed. Please try again or contact a server admin.'
          : data.name === 'late'
            ? 'Your late notice was not recorded because saving it failed. Please try again or contact a server admin.'
          : 'The request could not be completed because of an internal error. Please try again or contact a server admin.',
        true,
      );
    }
  },
);

await migrateLegacyGuildFunds(readData, updateData, updateGuildFundData);

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
  startScheduler();
});
