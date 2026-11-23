import 'dotenv/config';
import { randomUUID } from 'node:crypto';
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
  getRanAdminInfoMessage,
  getRanInfoMessage,
  WAR_SCHEDULE_TEXT,
} from './config.js';
import {
  getAttendanceMessage,
  getAttendanceStatus,
  formatWarDate,
  getDefaultLateReportDate,
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
import {
  deferInteractionResponse,
  editDeferredInteractionResponse,
} from './interaction-responses.js';
import {
  FIX_PARTY_LEADER_ROLE_NAME,
  formatFixPartyList,
  getPartyLedBy,
  getUserParty,
  splitDiscordMessages,
  validateFixPartyAdd,
} from './fix-party.js';
import { FIX_PARTY_INFO_MESSAGE } from './fix-party-command.js';
import {
  escapeReferralCode,
  getTopupInfoMessage,
  getTopupReferralReminderMessage,
  getTopupSettingsMessage,
} from './topup-reminder.js';
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
const guildOperationQueues = new Map();

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

async function withGuildOperationLock(guildId, operation) {
  const previous = guildOperationQueues.get(guildId) ?? Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  guildOperationQueues.set(guildId, queued);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (guildOperationQueues.get(guildId) === queued) {
      guildOperationQueues.delete(guildId);
    }
  }
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

async function sendPublicList(res, body, messages) {
  response(res, messages[0]);
  for (const content of messages.slice(1)) {
    await DiscordRequest(`webhooks/${process.env.APP_ID}/${body.token}`, {
      method: 'POST',
      body: { content, allowed_mentions: { parse: [] } },
    });
  }
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
  await editDeferredInteractionResponse(
    process.env.APP_ID,
    body.token,
    confirmation,
  );
  res.locals.interactionResponseCompleted = true;
  for (const content of messages) {
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

  deferInteractionResponse(res, EPHEMERAL);
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
  const dateInput = getOption(body.data.options, 'date');
  const sessionDate =
    dateInput === undefined
      ? getDefaultLateReportDate()
      : parseUpcomingWarDateInput(dateInput);
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

  deferInteractionResponse(res, EPHEMERAL);
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
      ? `Your late notice for ${formatWarDate(sessionDate)} is already recorded. An admin can view it with /ran-admin late date:${formatWarDate(sessionDate)}.`
      : `Your late notice for the ${formatWarDate(sessionDate)} war is recorded. An admin can view it with /ran-admin late date:${formatWarDate(sessionDate)}.`,
    formatLateListMessages(sessionDate, lateReports),
  );
}

async function fetchGuildRoles(guildId) {
  const result = await DiscordRequest(`guilds/${guildId}/roles`, { method: 'GET' });
  return result.json();
}

function isDiscordNotFound(error) {
  return /Discord API request failed \(404\)/.test(error.message);
}

async function createGuildRole(guildId, name) {
  const result = await DiscordRequest(`guilds/${guildId}/roles`, {
    method: 'POST',
    body: { name, permissions: '0', mentionable: false },
  });
  const role = await result.json();
  if (!role.id) throw new Error(`Discord did not return an ID for the "${name}" role.`);
  return role;
}

async function setMemberRole(guildId, userId, roleId, add) {
  try {
    return await DiscordRequest(
      `guilds/${guildId}/members/${userId}/roles/${roleId}`,
      { method: add ? 'PUT' : 'DELETE' },
    );
  } catch (error) {
    if (!add && isDiscordNotFound(error)) return;
    throw error;
  }
}

async function deleteGuildRole(guildId, roleId) {
  try {
    return await DiscordRequest(`guilds/${guildId}/roles/${roleId}`, {
      method: 'DELETE',
    });
  } catch (error) {
    if (isDiscordNotFound(error)) return;
    throw error;
  }
}

async function applyRoleChanges(guildId, changes) {
  const completed = [];
  try {
    for (const change of changes) {
      await setMemberRole(guildId, change.userId, change.roleId, change.add);
      completed.push(change);
    }
    return completed;
  } catch (error) {
    const rollbackErrors = [];
    for (const change of completed.reverse()) {
      try {
        await setMemberRole(guildId, change.userId, change.roleId, !change.add);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError.message);
      }
    }
    const reason = isDiscordNotFound(error)
      ? 'A selected member or party role could not be found; the member may have left the server or a party role may have been deleted.'
      : "Check the bot's Manage Roles permission and role hierarchy.";
    throw new Error(
      `Could not update party roles. ${reason}${rollbackErrors.length ? ` Role rollback also failed: ${rollbackErrors.join('; ')}` : ''}`,
      { cause: error },
    );
  }
}

async function rollbackRoleChanges(guildId, changes) {
  const errors = [];
  for (const change of [...changes].reverse()) {
    try {
      await setMemberRole(guildId, change.userId, change.roleId, !change.add);
    } catch (error) {
      errors.push(error.message);
    }
  }
  return errors;
}

async function deleteCreatedRoles(guildId, roleIds) {
  const errors = [];
  for (const roleId of [...roleIds].reverse()) {
    try {
      await deleteGuildRole(guildId, roleId);
    } catch (error) {
      errors.push(`${roleId}: ${error.message}`);
    }
  }
  return errors;
}

function getResolvedUser(body, userId) {
  return body.data.resolved?.users?.[userId];
}

function getPartyList(data, guildId) {
  return data.fixParties[guildId] ?? [];
}

function getPartyMemberDisplayName(member, user) {
  return getMemberName({ ...member, user }, user);
}

function getPartyOption(options, name) {
  return getOption(options, name);
}

async function handleFixParty(body, res) {
  if (!requireGuild(body, res)) return;
  const guildId = body.guild_id;
  return withGuildOperationLock(guildId, async () => {
    const { name: subcommand, options } = getSubcommand(body.data);
    const actorId = getUserId(body);
    if (!actorId) {
      return response(res, 'I could not identify your server account.', true);
    }

    const data = await readData();
    const parties = getPartyList(data, guildId);
    if (subcommand === 'info') {
      return response(res, FIX_PARTY_INFO_MESSAGE, true);
    }
    if (subcommand === 'list') {
      const sorted = [...parties].sort((left, right) => left.name.localeCompare(right.name));
      return sendPublicList(res, body, splitDiscordMessages(formatFixPartyList(sorted)));
    }
    if (subcommand === 'create') {
      if (getUserParty(parties, actorId)) {
        return response(res, 'You already belong to a fixed party in this server.', true);
      }
      const requestedName = getPartyOption(options, 'name');
      const partyName = (requestedName ?? `${getUserName(body)}'s Fixed Party`).trim();
      if (!partyName || partyName.length > 80 || /[\u0000-\u001f\u007f]/.test(partyName)) {
        return response(res, 'The party name must be 1–80 characters and cannot contain control characters.', true);
      }

      const createdRoleIds = [];
      const assignedRoles = [];
      try {
        const roles = await fetchGuildRoles(guildId);
        let sharedLeaderRole = roles.find((role) => role.name === FIX_PARTY_LEADER_ROLE_NAME);
        if (!sharedLeaderRole) {
          sharedLeaderRole = await createGuildRole(guildId, FIX_PARTY_LEADER_ROLE_NAME);
          createdRoleIds.push(sharedLeaderRole.id);
        }
        const sharedLeaderRoleId = sharedLeaderRole.id;
        const leaderRole = await createGuildRole(
          guildId,
          `${partyName} Leader`.slice(0, 100),
        );
        createdRoleIds.push(leaderRole.id);
        const memberRole = await createGuildRole(
          guildId,
          `${partyName} Members`.slice(0, 100),
        );
        createdRoleIds.push(memberRole.id);
        const roleChanges = [
          ...(!body.member?.roles?.includes(sharedLeaderRoleId)
            ? [{ userId: actorId, roleId: sharedLeaderRoleId, add: true }]
            : []),
          { userId: actorId, roleId: leaderRole.id, add: true },
        ];
        assignedRoles.push(...(await applyRoleChanges(guildId, roleChanges)));

        const now = new Date().toISOString();
        const party = {
          id: randomUUID(),
          name: partyName,
          leaderRoleId: leaderRole.id,
          memberRoleId: memberRole.id,
          leader: {
            userId: actorId,
            displayName: getUserName(body),
            joinedAt: now,
          },
          members: [],
        };
        try {
          await updateData((store) => {
            const storedParties = (store.fixParties[guildId] ??= []);
            if (getUserParty(storedParties, actorId)) {
              throw new Error('You already belong to a fixed party in this server.');
            }
            storedParties.push(party);
          });
        } catch (error) {
          const roleRollbackErrors = await rollbackRoleChanges(guildId, assignedRoles);
          const roleDeleteErrors = await deleteCreatedRoles(guildId, createdRoleIds);
          throw new Error(
            `Party data could not be saved.${roleRollbackErrors.length || roleDeleteErrors.length ? ` Cleanup also failed: ${[...roleRollbackErrors, ...roleDeleteErrors].join('; ')}` : ''}`,
            { cause: error },
          );
        }
        return response(res, `Fixed party **${partyName}** created. You are its leader.`, true);
      } catch (error) {
        if (assignedRoles.length === 0 && createdRoleIds.length) {
          const cleanupErrors = await deleteCreatedRoles(guildId, createdRoleIds);
          if (cleanupErrors.length) {
            console.error(`Could not clean up roles after party creation failed for guild ${guildId}:`, cleanupErrors);
            throw new Error(
              `${error.message} Role cleanup also failed: ${cleanupErrors.join('; ')}`,
              { cause: error },
            );
          }
        }
        throw error;
      }
    }

    const party = getPartyLedBy(parties, actorId);
    if (subcommand === 'add') {
      if (!party) {
        return response(res, 'Only a fixed-party leader can add members.', true);
      }
      const targetId = getPartyOption(options, 'name');
      const user = getResolvedUser(body, targetId);
      const resolvedMember = body.data.resolved?.members?.[targetId];
      const className = getPartyOption(options, 'class');
      const type = getPartyOption(options, 'type');
      if (!resolvedMember) {
        return response(res, 'That user is not currently a member of this server. Select a server member.', true);
      }
      const validation = validateFixPartyAdd({
        parties,
        party,
        actorId,
        user,
        className,
        type,
      });
      if (validation) return response(res, validation, true);
      const targetMember = { ...resolvedMember, user };
      if (targetMember.roles?.includes(party.memberRoleId)) {
        return response(res, 'That user already has this party role, but is not in the saved roster. Ask a server admin to resolve the mismatch.', true);
      }
      const roles = await fetchGuildRoles(guildId);
      if (!roles.some((role) => role.id === party.memberRoleId)) {
        return response(res, 'This party member role no longer exists. Ask a server admin to repair the party roles.', true);
      }
      const roleChange = { userId: targetId, roleId: party.memberRoleId, add: true };
      const applied = await applyRoleChanges(guildId, [roleChange]);
      try {
        const now = new Date().toISOString();
        await updateData((store) => {
          const storedParties = getPartyList(store, guildId);
          const storedParty = storedParties.find((entry) => entry.id === party.id);
          const storedValidation = validateFixPartyAdd({
            parties: storedParties,
            party: storedParty,
            actorId,
            user,
            className,
            type,
          });
          if (storedValidation) throw new Error(storedValidation);
          storedParty.members.push({
            userId: targetId,
            displayName: getPartyMemberDisplayName(targetMember, user),
            joinedAt: now,
            className,
            type,
          });
        });
      } catch (error) {
        const rollbackErrors = await rollbackRoleChanges(guildId, applied);
        throw new Error(
          `The member role was assigned, but party data could not be saved.${rollbackErrors.length ? ` Role rollback also failed: ${rollbackErrors.join('; ')}` : ''}`,
          { cause: error },
        );
      }
      return response(res, `Added <@${targetId}> to **${party.name}** as ${className} / ${type}.`, true);
    }

    if (subcommand === 'remove') {
      if (!party) return response(res, 'Only a fixed-party leader can remove members.', true);
      const targetId = getPartyOption(options, 'name');
      const user = getResolvedUser(body, targetId);
      const resolvedMember = body.data.resolved?.members?.[targetId];
      if (!targetId || !user || !resolvedMember) {
        return response(res, 'Select a member who is currently in this server.', true);
      }
      const member = party.members.find((entry) => entry.userId === targetId);
      if (!member) {
        return response(res, 'That user is not a member of your fixed party.', true);
      }
      const roleChange = { userId: targetId, roleId: party.memberRoleId, add: false };
      const applied = await applyRoleChanges(guildId, [roleChange]);
      try {
        await updateData((store) => {
          const storedParty = getPartyLedBy(getPartyList(store, guildId), actorId);
          if (!storedParty?.members.some((entry) => entry.userId === targetId)) {
            throw new Error('That user is no longer a member of your fixed party.');
          }
          storedParty.members = storedParty.members.filter(
            (entry) => entry.userId !== targetId,
          );
        });
      } catch (error) {
        const rollbackErrors = await rollbackRoleChanges(guildId, applied);
        throw new Error(
          `The member role was removed, but party data could not be saved.${rollbackErrors.length ? ` Role rollback also failed: ${rollbackErrors.join('; ')}` : ''}`,
          { cause: error },
        );
      }
      return response(res, `Removed ${member.displayName} from **${party.name}**.`, true);
    }

    if (subcommand === 'leave') {
      const userParty = getUserParty(parties, actorId);
      if (!userParty) return response(res, 'You are not currently in a fixed party.', true);
      if (userParty.leader.userId !== actorId) {
        const roleChange = {
          userId: actorId,
          roleId: userParty.memberRoleId,
          add: false,
        };
        const applied = await applyRoleChanges(guildId, [roleChange]);
        try {
          await updateData((store) => {
            const storedParty = getPartyList(store, guildId).find(
              (entry) => entry.id === userParty.id,
            );
            if (!storedParty?.members.some((entry) => entry.userId === actorId)) {
              throw new Error('You are no longer listed in that fixed party.');
            }
            storedParty.members = storedParty.members.filter(
              (entry) => entry.userId !== actorId,
            );
          });
        } catch (error) {
          const rollbackErrors = await rollbackRoleChanges(guildId, applied);
          throw new Error(
            `Your role was removed, but party data could not be saved.${rollbackErrors.length ? ` Role rollback also failed: ${rollbackErrors.join('; ')}` : ''}`,
            { cause: error },
          );
        }
        return response(res, `You left **${userParty.name}**.`, true);
      }

      if (userParty.members.length === 0) {
        return disbandFixParty(guildId, actorId, userParty, res, 'left');
      }
      const successor = [...userParty.members].sort(
        (left, right) =>
          left.joinedAt.localeCompare(right.joinedAt) ||
          left.userId.localeCompare(right.userId),
      )[0];
      const roles = await fetchGuildRoles(guildId);
      const leaderRole = roles.find((role) => role.name === FIX_PARTY_LEADER_ROLE_NAME);
      if (
        !leaderRole ||
        !roles.some((role) => role.id === userParty.leaderRoleId) ||
        !roles.some((role) => role.id === userParty.memberRoleId)
      ) {
        return response(res, 'One or more party roles are missing. Ask a server admin to repair the roles before transferring leadership.', true);
      }
      const roleChanges = [
        { userId: successor.userId, roleId: userParty.memberRoleId, add: false },
        { userId: successor.userId, roleId: userParty.leaderRoleId, add: true },
        { userId: successor.userId, roleId: leaderRole.id, add: true },
        { userId: actorId, roleId: userParty.leaderRoleId, add: false },
        { userId: actorId, roleId: leaderRole.id, add: false },
      ];
      let applied;
      try {
        applied = await applyRoleChanges(guildId, roleChanges);
      } catch (error) {
        if (isDiscordNotFound(error.cause)) {
          return response(
            res,
            `The earliest-joined member, ${successor.displayName}, may no longer be in this server. Remove them from the roster before you can leave. ${error.message}`,
            true,
          );
        }
        throw error;
      }
      try {
        await updateData((store) => {
          const storedParty = getPartyList(store, guildId).find(
            (entry) => entry.id === userParty.id,
          );
          if (
            !storedParty ||
            storedParty.leader.userId !== actorId ||
            !storedParty.members.some((entry) => entry.userId === successor.userId)
          ) {
            throw new Error('Party membership changed before leadership could be transferred.');
          }
          storedParty.leader = successor;
          storedParty.members = storedParty.members.filter(
            (entry) => entry.userId !== successor.userId,
          );
        });
      } catch (error) {
        const rollbackErrors = await rollbackRoleChanges(guildId, applied);
        throw new Error(
          `Roles were changed, but the leadership transfer could not be saved.${rollbackErrors.length ? ` Role rollback also failed: ${rollbackErrors.join('; ')}` : ''}`,
          { cause: error },
        );
      }
      return response(
        res,
        `You left **${userParty.name}**. <@${successor.userId}> is now the party leader.`,
        true,
      );
    }

    if (subcommand === 'disband') {
      if (!party) return response(res, 'Only a fixed-party leader can disband a party.', true);
      return disbandFixParty(guildId, actorId, party, res, 'disbanded');
    }
    return response(res, 'Unknown fix-party command.', true);
  });
}

async function disbandFixParty(guildId, actorId, party, res, action) {
  const roles = await fetchGuildRoles(guildId);
  const leaderRole = roles.find((role) => role.name === FIX_PARTY_LEADER_ROLE_NAME);
  const roleChanges = [
    { userId: actorId, roleId: party.leaderRoleId, add: false },
    ...(leaderRole ? [{ userId: actorId, roleId: leaderRole.id, add: false }] : []),
    ...party.members.map((member) => ({
      userId: member.userId,
      roleId: party.memberRoleId,
      add: false,
    })),
  ];
  const applied = await applyRoleChanges(guildId, roleChanges);
  try {
    await updateData((store) => {
      const storedParties = getPartyList(store, guildId);
      const index = storedParties.findIndex((entry) => entry.id === party.id);
      if (index < 0) throw new Error('This fixed party no longer exists.');
      storedParties.splice(index, 1);
    });
  } catch (error) {
    const rollbackErrors = await rollbackRoleChanges(guildId, applied);
    throw new Error(
      `Party data could not be updated.${rollbackErrors.length ? ` Role rollback also failed: ${rollbackErrors.join('; ')}` : ''}`,
      { cause: error },
    );
  }
  const deleteErrors = await deleteCreatedRoles(guildId, [
    party.leaderRoleId,
    party.memberRoleId,
  ]);
  if (deleteErrors.length) {
    throw new Error(
      `The party was removed from the roster, but one or more party roles could not be deleted. Remove these roles manually: ${deleteErrors.join('; ')}`,
    );
  }
  const message =
    action === 'left'
      ? `You left **${party.name}**. It had no other members, so the party was disbanded.`
      : `**${party.name}** was disbanded and its party roles were deleted.`;
  return response(res, message, true);
}

async function handleAdmin(body, res, data) {
  if (!requireGuild(body, res)) return;
  const { group, name: subcommand, options } = getSubcommand(data);
  const guildId = body.guild_id;
  const actorId = getUserId(body);
  const current = await readData();
  const settings = current.guilds[guildId];
  const isBootstrapAdmin = hasManageGuildPermission(body);

  if (subcommand === 'info') {
    if (!isBootstrapAdmin && !isAuthorizedAdmin(body, settings)) {
      return response(res, 'You need Manage Server permission or an authorized admin role to view admin commands.', true);
    }
    const infoMessages = splitDiscordMessages(
      getRanAdminInfoMessage(settings).split('\n'),
    );
    return sendAdminMessages(res, body, infoMessages);
  }

  if (subcommand !== 'setup' && !isAuthorizedAdmin(body, settings)) {
    return response(res, 'You need an authorized admin role to use this command.', true);
  }
  if (subcommand === 'setup' && !isBootstrapAdmin && !isAuthorizedAdmin(body, settings)) {
    return response(res, 'Initial setup requires the Manage Server permission. After setup, authorized roles can manage the bot.', true);
  }
  if (subcommand === 'setup') {
    const adminRoleId = getOption(options, 'admin_role');
    const warChannelId = getOption(options, 'war_channel');
    const fundChannelId = getOption(options, 'fund_channel');
    if (!warChannelId || !fundChannelId) {
      return response(
        res,
        'Choose both a war reminder channel and a guild fund channel.',
        true,
      );
    }
    await updateData((store) => {
      const previous = store.guilds[guildId];
      store.guilds[guildId] = {
        ...previous,
        channelId: warChannelId,
        adminRoleIds: [adminRoleId],
        updatedAt: new Date().toISOString(),
        updatedBy: actorId,
      };
      if (previous?.adminRoleIds?.includes(adminRoleId)) {
        store.guilds[guildId].adminRoleIds = previous.adminRoleIds;
      }
    });
    await updateGuildFund(updateGuildFundData, guildId, {
      channelId: fundChannelId,
    });
    return response(
      res,
      `Setup complete. Commands can be used in any server channel. War reminders will be sent in <#${warChannelId}> and guild fund updates will be sent in <#${fundChannelId}>. <@&${adminRoleId}> can manage bot settings and attendance. Use /ran-admin settings to review the configuration.`,
      true,
    );
  }

  if (!settings) {
    return response(res, 'The bot has not been configured yet. Ask a server manager to run /ran-admin setup.', true);
  }

  if (group === 'topup') {
    const topup = settings.topup ?? {};
    if (subcommand === 'info') {
      return response(res, getTopupInfoMessage(), true);
    }
    if (subcommand === 'settings') {
      return response(res, getTopupSettingsMessage(topup), true);
    }

    if (subcommand === 'remind') {
      if (
        typeof topup.code !== 'string' ||
        !topup.code.trim() ||
        typeof topup.channelId !== 'string' ||
        !topup.channelId
      ) {
        return response(
          res,
          'Set both the referral code and reminder channel before posting a top-up reminder.',
          true,
        );
      }
      response(
        res,
        `Sending the top-up reminder to <#${topup.channelId}> now...`,
        true,
      );
      try {
        await DiscordRequest(`channels/${topup.channelId}/messages`, {
          method: 'POST',
          body: {
            content: getTopupReferralReminderMessage(topup.code),
            allowed_mentions: { parse: ['everyone'] },
          },
        });
      } catch (error) {
        console.error(`Could not manually post top-up reminder for guild ${guildId}:`, error);
        try {
          await sendEphemeralFollowup(
            body,
            `The top-up reminder could not be posted to <#${topup.channelId}>. Check the bot's channel permissions.`,
          );
        } catch (followupError) {
          console.error(`Could not report top-up reminder failure for guild ${guildId}:`, followupError);
        }
        return;
      }
      try {
        await sendEphemeralFollowup(body, 'The top-up reminder was posted.');
      } catch (error) {
        console.error(`Top-up reminder posted but confirmation failed for guild ${guildId}:`, error);
      }
      return;
    }

    if (subcommand === 'code') {
      const code = getOption(options, 'code')?.trim();
      if (!code || code.length > 100 || /[\u0000-\u001f\u007f]/.test(code)) {
        return response(res, 'Enter a referral code between 1 and 100 characters on a single line.', true);
      }
      await updateData((store) => {
        const guildSettings = store.guilds[guildId];
        guildSettings.topup ??= {};
        guildSettings.topup.code = code;
      });
      return response(
        res,
        `Top-up referral reminders post at 6:00 PM daily and 9:05 PM on war days when reminders are enabled and a channel is configured.${topup.enabled === false ? ' Top-up reminders are currently disabled; use /ran-admin topup enable to enable them.' : ''}`,
        true,
      );
    }

    if (subcommand === 'channel') {
      const channelId = getOption(options, 'channel');
      if (!channelId) return response(res, 'Choose a channel for top-up reminders.', true);
      await updateData((store) => {
        const guildSettings = store.guilds[guildId];
        guildSettings.topup ??= {};
        guildSettings.topup.channelId = channelId;
      });
      return response(
        res,
        `Top-up referral reminders will be posted in <#${channelId}> at 6:00 PM daily and 9:05 PM on war days when enabled and a code is configured.${topup.enabled === false ? ' Top-up reminders are currently disabled; use /ran-admin topup enable to enable them.' : ''}`,
        true,
      );
    }

    if (subcommand === 'disable' || subcommand === 'enable') {
      const enabled = subcommand === 'enable';
      await updateData((store) => {
        const guildSettings = store.guilds[guildId];
        guildSettings.topup ??= {};
        guildSettings.topup.enabled = enabled;
      });
      if (!enabled) {
        return response(
          res,
          'Top-up referral reminders and non-war reminder callouts are disabled. The saved code and channel were kept.',
          true,
        );
      }
      const hasConfiguration =
        typeof topup.code === 'string' &&
        topup.code.trim().length > 0 &&
        typeof topup.channelId === 'string' &&
        topup.channelId.length > 0;
      return response(
        res,
        hasConfiguration
          ? `Top-up referral reminders and non-war callouts are enabled. Reminders will post in <#${topup.channelId}> at 6:00 PM daily and 9:05 PM on war days (Manila time).`
          : 'Top-up reminders are enabled, but will not post until both a referral code and reminder channel are configured.',
        true,
      );
    }
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
          `${subcommand === 'ep' ? 'EP' : subcommand === 'gold' ? 'Gold' : 'PHP cash'} fund updated. Set an announcement channel with /ran-admin fund channel to notify everyone.`,
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
          body: getGuildFundAnnouncement(fund, subcommand),
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
    const topup = settings.topup ?? {};
    const topupStatus = topup.enabled === false ? 'Disabled' : 'Enabled';
    return response(
      res,
      `**Ran Online bot settings**\nWar reminder channel: <#${settings.channelId}>\nAdmin roles: ${roles}\nSchedule: ${WAR_SCHEDULE_TEXT} ${BOT_CONFIG.timezone}\nAttendance: ${formatTime(BOT_CONFIG.attendanceStart)}–${formatTime(BOT_CONFIG.attendanceEnd)} ${BOT_CONFIG.timezone}\nFund announcement channel: ${fund.channelId ? `<#${fund.channelId}>` : 'Not set'}\nEP fund: ${fund.ep ?? 'Not set'}\nGold fund: ${fund.gold ?? 'Not set'}\nPHP cash fund: ${fund.php ?? 'Not set'}\nTop-up referral reminders: ${topupStatus}\nTop-up referral code: ${topup.code ? `\`${escapeReferralCode(topup.code)}\`` : 'Not set'}\nTop-up reminder channel: ${topup.channelId ? `<#${topup.channelId}>` : 'Not set'}\nTop-up reminder times: 6:00 PM daily; 9:05 PM on war days (${BOT_CONFIG.timezone})`,
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
      if (data.name === 'ran') {
        if (!requireGuild(req.body, res)) return;
        const { name: subcommand } = getSubcommand(data);
        if (subcommand !== 'info') {
          return response(res, 'Unknown Ran Online member command.', true);
        }
        const infoMessages = splitDiscordMessages(
          getRanInfoMessage().split('\n'),
        );
        return sendAdminMessages(res, req.body, infoMessages);
      }
      if (data.name === 'guild-fund') {
        if (!requireGuild(req.body, res)) return;
        if (data.options?.some((option) => option.name === 'info')) {
          return response(res, formatGuildFundInfoMessage());
        }
        const current = await readGuildFundData();
        return response(res, formatGuildFundMessage(current.guildFunds[req.body.guild_id]));
      }
      if (data.name === 'ran-admin') return await handleAdmin(req.body, res, data);
      if (data.name === 'fix-party') return await handleFixParty(req.body, res);
      return response(res, `Unknown command: ${data.name}`, true);
    } catch (error) {
      console.error(`Interaction ${data.name} failed:`, error);
      if (res.headersSent) {
        if (
          res.locals.interactionDeferred &&
          !res.locals.interactionResponseCompleted
        ) {
          const content =
            data.name === 'attended'
              ? 'Attendance could not be confirmed because of a system error. Please check with a server admin before trying again.'
              : 'Your late notice could not be confirmed because of a system error. Please check with a server admin before trying again.';
          try {
            await editDeferredInteractionResponse(
              process.env.APP_ID,
              req.body.token,
              content,
            );
            res.locals.interactionResponseCompleted = true;
          } catch (responseError) {
            console.error(
              `Failed to report ${data.name} error to Discord:`,
              responseError,
            );
          }
        }
        return;
      }
      return response(
        res,
        data.name === 'fix-party'
          ? String(error.message).slice(0, 1800)
          : data.name === 'attended'
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
